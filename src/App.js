import GUI from 'lil-gui';
import {
  PerspectiveCamera,
  PMREMGenerator,
  REVISION,
  Scene,
  sRGBEncoding,
  WebGLRenderer,
  Color,
  MeshStandardMaterial,
  DoubleSide,
  SphereGeometry,
  Mesh,
  Group,
  CylinderGeometry, LineBasicMaterial, CatmullRomCurve3, Vector3, Line, BufferGeometry,
} from 'three';
import AssetLoader from './AssetLoader.js';
import Stats from 'three/addons/libs/stats.module.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { MarchingCubes } from 'three/addons/objects/MarchingCubes.js';
import { TWEEN } from 'three/addons/libs/tween.module.min.js';

const deepCopy = (obj) => JSON.parse(JSON.stringify(obj));
const randomChromosomePos = (bounds) => ((-0.5 + Math.random()) * bounds * 2.0);

const getv1 = (first, second) => {
  return [
    (first[0] + second[0]) / 2.0,
    (first[1] + second[1]) / 2.0,
    (first[2] + second[2]) / 2.0,
  ];
};

const getv2 = (first, second) => {
  return [
    (first[0] + second[0]) / 2.0,
    (first[1] + second[1]) / 2.0,
    (first[2] + second[2]) / 2.0,
  ];
};

const randomColorStr = () => {
  let maxVal = 0xFFFFFF; // 16777215
  let randomNumber = Math.random() * maxVal;
  randomNumber = Math.floor(randomNumber);
  randomNumber = randomNumber.toString(16);
  let randColor = randomNumber.padStart(6, 0);
  return `#${randColor.toUpperCase()}`;
};

const BASE = '';

class App {
  #gui;
  #config;
  #container;
  #stats;
  #assetLoader;
  #renderer;
  #pmremGenerator;
  #scene;
  #camera;
  #orbit;
  #width = 10;
  #height = 10;
  #shouldRender = true;
  #prevTime = 0;
  #blobs;
  #activeTweens = [];

  constructor(containerID) {
    this.#gui = new GUI();

    this.#config = {
      envTexture: 'QA_03_white.hdr',
      resolution: 28,
      isolation: 80,
      speed: 0.5,
      color: '#ffff00',
      opacity: 0.3,
      cells: [],
      phase: 'startup',
    };

    this.#setupCellsConfig();

    console.log(`three.js r${REVISION}`);
    this.#container = document.querySelector(containerID);
    this.#assetLoader = new AssetLoader();

    this.#renderer = new WebGLRenderer({
      antialias: true,
    });
    this.#renderer.setPixelRatio(window.devicePixelRatio || 1);
    this.#renderer.outputEncoding = sRGBEncoding;
    this.#renderer.debug.checkShaderErrors = true;
    this.#container.appendChild(this.#renderer.domElement);

    this.#stats = new Stats();
    this.#stats.dom.height = '48px';
    this.#stats.dom.style.position = 'static';
    [].forEach.call(this.#stats.dom.children, child => (child.style.display = ''));

    // const perfFolder = this.#gui.addFolder('Performance');
    // const perfLi = document.createElement('li');
    // perfLi.appendChild(this.#stats.domElement);
    // perfLi.classList.add('gui-stats');
    // perfFolder.domElement.appendChild(perfLi);

    this.#pmremGenerator = new PMREMGenerator(this.#renderer);
    this.#pmremGenerator.compileEquirectangularShader();

    this.#scene = new Scene();
    this.#scene.background = new Color('#909090');
    this.#scene.backgroundBlurriness = 0.5;

    this.#camera = new PerspectiveCamera();
    this.#camera.position.set(0, 0, 1);
    this.#camera.lookAt(0, 0, 0);

    this.#orbit = new OrbitControls(this.#camera, this.#renderer.domElement);
    this.#orbit.addEventListener('change', () => { this.#shouldRender = true; });
  }

  #setupCellsConfig() {
    const nucleusSize = 0.08;

    const cellTemplate = {
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      nucleus: {
        position: [0, 0, 0],
        color: '#00ff00',
        opacity: 0.2,
        size: nucleusSize,
      },
      centrosome: {
        color: '#0000ff',
        position: [0, -0.2, 0],
        size: 0.04,
        spindlesLength: 0,
      },
    };

    const cells = [deepCopy(cellTemplate), deepCopy(cellTemplate)];
    this.#config.cells = cells;

    const numChromosomes = 4;

    let chromosomes = [];
    for (let i = 0; i < numChromosomes; i += 1) {
      const color = randomColorStr();
      const position = [
        (-0.5 + Math.random()) * nucleusSize * 2.0,
        (-0.5 + Math.random()) * nucleusSize * 2.0,
        (-0.5 + Math.random()) * nucleusSize * 2.0,
      ];
      const offset = [0, 0, 0];
      const rotation = [
        Math.random() * Math.PI,
        Math.random() * Math.PI,
        Math.random() * Math.PI,
      ];
      const size = 0.05;
      chromosomes = [...chromosomes, {
        color,
        position,
        offset,
        rotation,
        size,
      }];
    }
    this.#config.chromosomes = chromosomes;
  }

  async initScene() {
    const envTexture = await this.#assetLoader.load(`${BASE}/assets/textures/${this.#config.envTexture}`);
    const envRT = this.#pmremGenerator.fromEquirectangular(envTexture);
    this.#scene.environment = envRT.texture;
    this.#scene.background = envRT.texture;

    await this.#initCells();

    this.#shouldRender = true;
    this.#setupGUI();

    return true;
  }

  animate = (time) => {
    this.#resize();

    this.#orbit.update();
    this.#stats.update();
    TWEEN.update(time);

    const calcTime = (time / 1000.0) * this.#config.speed;
    this.#updateCells(/*calcTime*/ 1.0);

    if (this.#shouldRender) {
      // const prev = performance.now();
      this.#renderer.render(this.#scene, this.#camera);
      // const delta = performance.now() - prev;
      // console.log(`frame rendered ${delta} ms`);
      this.#shouldRender = true; // false;
    }

    requestAnimationFrame(this.animate);
  };

  #resize () {
    const width = Math.floor(window.innerWidth || 10);
    const height = Math.floor(window.innerHeight || 10);

    if ((width !== this.#width) || (height !== this.#height)) {
      this.#width = width;
      this.#height = height;

      this.#renderer.setSize(width, height);

      this.#camera.aspect = width / height;
      this.#camera.updateProjectionMatrix();

      this.#shouldRender = true;
    }
  }

  async #initCells() {
    const displacementMap = await this.#assetLoader.load(`${BASE}/assets/textures/displacement.jpg`);

    const {
      resolution,
      color,
      opacity,
      cells,
      chromosomes,
    } = this.#config;
    const material = new MeshStandardMaterial({
      color,
      opacity,
      roughness: 0.2,
      metalness: 0.8,
      side: DoubleSide,
      transparent: true,
    });

    this.#blobs = new MarchingCubes(resolution, material, true, true);
    this.#blobs.position.set(0, 0, 0);
    this.#blobs.scale.set(1, 1, 1);
    this.#scene.add(this.#blobs);

    const cellsObj = new Group();
    cellsObj.name = 'cells';
    this.#scene.add(cellsObj);

    cells.forEach((cell, index) => {
      const {
        nucleus,
        centrosome,
      } = cell;

      const cellObj = new Group();
      cellObj.name = `cell${index}`;
      cellsObj.add(cellObj);

      const nucleusGeometry = new SphereGeometry(1);
      const nucleusMaterial = new MeshStandardMaterial({
        color: nucleus.color,
        opacity: nucleus.opacity,
        transparent: true,
        displacementMap,
      });

      const nucleusMesh = new Mesh(nucleusGeometry, nucleusMaterial);
      nucleusMesh.renderOrder = -1;
      nucleusMesh.scale.set(nucleus.size, nucleus.size, nucleus.size);
      nucleusMesh.name = `nucleus${index}`;
      cellObj.add(nucleusMesh);

      const centrosomeGeometry = new CylinderGeometry(0.1, 0.1, 1);
      const centrosomeMaterial = new MeshStandardMaterial({
        color: centrosome.color,
      });
      const centrosomeMesh = new Mesh(centrosomeGeometry, centrosomeMaterial);
      const centrosomeObj = new Group();
      centrosomeObj.scale.set(centrosome.size, centrosome.size, centrosome.size);
      centrosomeObj.name = `centrosome${index}`;
      centrosomeObj.add(centrosomeMesh);
      const centrosomeMeshClone = centrosomeMesh.clone();
      centrosomeMeshClone.rotateZ(Math.PI / 2.0);
      centrosomeObj.add(centrosomeMeshClone);
      cellObj.add(centrosomeObj);
    });

    const chromosomesObj = new Group();
    chromosomesObj.name = `chromosomes`;
    this.#scene.add(chromosomesObj);

    const chromosomesObj0 = new Group();
    chromosomesObj0.name = `chromosomes0`;
    chromosomesObj.add(chromosomesObj0);

    const chromosomesObj1 = new Group();
    chromosomesObj1.name = `chromosomes1`;
    chromosomesObj.add(chromosomesObj1);

    const spindlesObj = new Group();
    spindlesObj.name = 'spindles';
    this.#scene.add(spindlesObj);

    const spindlesObj0 = new Group();
    spindlesObj0.name = 'spindles0';
    spindlesObj.add(spindlesObj0);

    const spindlesObj1 = new Group();
    spindlesObj1.name = 'spindles1';
    spindlesObj.add(spindlesObj1);

    const chromosomeGeometry = new CylinderGeometry(0.05, 0.05, 1)
    chromosomes.forEach((chromosome, index) => {
      const chromosomeMaterial = new MeshStandardMaterial({
        color: chromosome.color,
      });
      chromosomeMaterial.color.multiplyScalar(0.5);
      const mesh0 = new Mesh(chromosomeGeometry, chromosomeMaterial);
      mesh0.rotation.set(0, 0, Math.PI / 10.0);
      mesh0.scale.set(chromosome.size, chromosome.size, chromosome.size);
      const chromosomeObj0 = new Group();
      chromosomeObj0.name = `chromosome0${index}`;
      chromosomeObj0.add(mesh0);
      chromosomesObj0.add(chromosomeObj0);
      const mesh1 = new Mesh(chromosomeGeometry, chromosomeMaterial);
      mesh1.rotation.set(0, 0, -Math.PI / 10.0);
      mesh1.scale.set(chromosome.size, chromosome.size, chromosome.size);
      const chromosomeObj1 = new Group();
      chromosomeObj1.name = `chromosome1${index}`;
      chromosomeObj1.add(mesh1);
      chromosomesObj1.add(chromosomeObj1);

      const curveMaterial = new LineBasicMaterial({ color: chromosome.color });
      const initialPoints0 = [
        [0, 0, 0],
        [1, 1, 1],
      ];
      const curve0 = new CatmullRomCurve3(
        initialPoints0.map((point) => new Vector3(...point)),
      );
      const curve0Geometry = new BufferGeometry().setFromPoints(curve0);
      const line0 = new Line(curve0Geometry, curveMaterial);
      line0.name = `spindle0${index}`;
      spindlesObj0.add(line0);

      const initialPoints1 = [
        [0, 0, 0],
        [1, 1, 1],
      ];
      const curve1 = new CatmullRomCurve3(
        initialPoints1.map((point) => new Vector3(...point)),
      );
      const curve1Geometry = new BufferGeometry().setFromPoints(curve1);
      const line1 = new Line(curve1Geometry, curveMaterial);
      line1.name = `spindle1${index}`;
      spindlesObj1.add(line1);
    });

    return true;
  }

  #updateCells(time) {
    const { cells, chromosomes } = this.#config;

    // const posX = Math.sin(time * Math.PI / 2.0) * bounds;
    // cells[0].position = [posX, 0, 0];
    // cells[1].position = [-posX, 0, 0];

    const {
      resolution,
      isolation,
    } = this.#config;

    if (this.#blobs.resolution !== resolution) {
      this.#blobs.resolution = resolution;
    }

    if (this.#blobs.isolation !== isolation) {
      this.#blobs.isolation = isolation;
    }

    this.#blobs.reset();

    const subtract = 12;
    const strength = 1.2 / ( ( Math.sqrt(2) - 1 ) / 4 + 1 );

    cells.forEach((cell, index) => {
      const {
        position,
        rotation,
        nucleus,
        centrosome,
      } = cell;
      this.#blobs.addBall(
        0.5 + position[0] / 2.0,
        0.5 + position[1] / 2.0,
        0.5 + position[2] / 2.0,
        strength,
        subtract,
      );

      const cellObj = this.#scene.getObjectByName(`cell${index}`);
      cellObj.position.set(...position);
      cellObj.rotation.set(...rotation);

      const nucleusMesh = this.#scene.getObjectByName(`nucleus${index}`);
      nucleusMesh.material.opacity = nucleus.opacity;

      const centrosomeObj = this.#scene.getObjectByName(`centrosome${index}`);
      centrosomeObj.position.set(
        centrosome.position[0],
        centrosome.position[1],
        centrosome.position[2],
      );
    });

    const chromosomesObj = this.#scene.getObjectByName(`chromosomes`);
    const spindlesObj = this.#scene.getObjectByName('spindles');

    const [chromosomesObj0, chromosomesObj1] = chromosomesObj.children;
    const [spindlesObj0, spindlesObj1] = spindlesObj.children;
    chromosomes.forEach((chromosome, index) => {
      const chr0 = chromosomesObj0.getObjectByName(`chromosome0${index}`);
      const position0 = [
        chromosome.position[0] + chromosome.offset[0] + cells[0].position[0],
        chromosome.position[1] + chromosome.offset[1] + cells[0].position[1],
        chromosome.position[2] + chromosome.offset[2] + cells[0].position[2],
      ];
      chr0.position.set(...position0);
      chr0.rotation.set(...chromosome.rotation);

      const sp0 = spindlesObj0.getObjectByName(`spindle0${index}`);
      const centrosome0Obj = this.#scene.getObjectByName('centrosome0');
      const centrosomeWorldPos0 = new Vector3();
      centrosome0Obj.getWorldPosition(centrosomeWorldPos0);
      const points0 = [
        [...centrosomeWorldPos0],
        [...position0],
      ];
      sp0.geometry.setFromPoints(points0.map((pt) => (new Vector3(...pt))));

      const chr1 = chromosomesObj1.getObjectByName(`chromosome1${index}`);
      const position1 = [
        chromosome.position[0] - chromosome.offset[0] + cells[1].position[0],
        chromosome.position[1] - chromosome.offset[1] + cells[1].position[1],
        chromosome.position[2] - chromosome.offset[2] + cells[1].position[2],
      ];
      chr1.position.set(...position1);
      chr1.rotation.set(...chromosome.rotation);
    });

    this.#blobs.update();
  }

  #playInterphase() {
    const { cells, chromosomes } = this.#config;
    const obj = {
      rotation: 0,
    };

    const tween0 = new TWEEN.Tween(obj)
      .to({
        rotation: Math.PI / 6.0,
      }, 2000)
      .easing(TWEEN.Easing.Quadratic.InOut)
      .onUpdate(() => {
        cells[0].rotation = [0, 0, obj.rotation];
        cells[1].rotation = [0, 0, -obj.rotation];
      })
      .onComplete(() => {})
      .start();

    return [tween0];
  }

  #playProphase() {
    const { cells } = this.#config;
    const obj = {
      rotation: Math.PI / 6.0,
    };

    const tween0 = new TWEEN.Tween(obj)
      .to({
        rotation: Math.PI / 2.0,
      }, 2000)
      .easing(TWEEN.Easing.Quadratic.InOut)
      .onUpdate(() => {
        cells[0].rotation = [0, 0, obj.rotation];
        cells[1].rotation = [0, 0, -obj.rotation];
      })
      .onComplete(() => {})
      .start();

    return [tween0];
  }

  #playMetaphase() {
    const { cells, chromosomes } = this.#config;

    let tweens = [];
    chromosomes.forEach((chromosome, index) => {
      const obj = {
        px: chromosome.position[0],
        py: chromosome.position[1],
        pz: chromosome.position[2],
        rx: chromosome.rotation[0],
        ry: chromosome.rotation[1],
        rz: chromosome.rotation[2],
      };
      const { size } = cells[0].nucleus;
      const tween = new TWEEN.Tween(obj)
        .to({
          px: 0,
          py: (-0.5 + (index / (chromosomes.length - 1))) * size * 2.0,
          pz: 0,
          rx: 0,
          ry: 0,
          rz: 0,
        }, 2000)
        .easing(TWEEN.Easing.Quadratic.InOut)
        .onUpdate(() => {
          chromosome.position = [obj.px, obj.py, obj.pz];
          chromosome.rotation = [obj.rx, obj.ry, obj.rz];
        })
        .onComplete(() => {})
        .start();
      tweens = [...tweens, tween];
    });

    return tweens;
  }

  #playAnaphase() {
    const { cells, chromosomes } = this.#config;

    let tweens = [];
    chromosomes.forEach((chromosome, index) => {
      const obj = {
        ox: 0,
        oy: 0,
        oz: 0,
      };
      // const { size } = cells[0].nucleus;
      const tween = new TWEEN.Tween(obj)
        .to({
          ox: 0.05,
          oy: 0,
          oz: 0,
        }, 2000)
        .easing(TWEEN.Easing.Quadratic.InOut)
        .onUpdate(() => {
          chromosome.offset = [obj.ox, obj.oy, obj.oz];
        })
        .onComplete(() => {})
        .start();
      tweens = [...tweens, tween];
    });

    return tweens;
  }

  #playTelophase() {
    const { cells, chromosomes } = this.#config;
    const obj = {
      position: 0,
    };
    const tween1 = new TWEEN.Tween(obj)
      .to({
        position: 0.3,
      }, 4000)
      .easing(TWEEN.Easing.Quadratic.Out)
      .onUpdate(() => {
        cells[0].position = [obj.position, 0, 0];
        cells[1].position = [-obj.position, 0, 0];
      })
      .onComplete(() => {});

    const tween0 = new TWEEN.Tween(obj)
      .to({
        position: 0.1,
      }, 2000)
      .easing(TWEEN.Easing.Quadratic.In)
      .onUpdate(() => {
        cells[0].position = [obj.position, 0, 0];
        cells[1].position = [-obj.position, 0, 0];
      })
      .onComplete(() => { tween1.start(); })
      .start();

    // return [tween0];

    let tweens = [tween0];
    chromosomes.forEach((chromosome, index) => {
      const obj = {
        px: chromosome.position[0],
        py: chromosome.position[1],
        pz: chromosome.position[2],
        rx: chromosome.rotation[0],
        ry: chromosome.rotation[1],
        rz: chromosome.rotation[2],
        ox: 0.05,
        oy: 0,
        oz: 0,
      };
      // const { size } = cells[0].nucleus;
      const tween = new TWEEN.Tween(obj)
        .to({
          px: (-0.5 + Math.random()) * cells[0].nucleus.size * 2.0,
          py: (-0.5 + Math.random()) * cells[0].nucleus.size * 2.0,
          pz: (-0.5 + Math.random()) * cells[0].nucleus.size * 2.0,
          rx: Math.random() * Math.PI,
          ry: Math.random() * Math.PI,
          rz: Math.random() * Math.PI,
          ox: 0,
          oy: 0,
          oz: 0,
        }, 6000)
        .easing(TWEEN.Easing.Quadratic.InOut)
        .onUpdate(() => {
          chromosome.position = [obj.px, obj.py, obj.pz];
          chromosome.offset = [obj.ox, obj.oy, obj.oz];
          chromosome.rotation = [obj.rx, obj.ry, obj.rz];
        })
        .onComplete(() => {})
        .start();
      tweens = [...tweens, tween];
    });
  }

  #playStartup() {
    return [];
  }

  #playPhase(name) {
    this.#activeTweens.forEach((tween) => {
      tween.stop();
    });

    let phase;
    switch (name) {
      case 'interphase':
        phase = this.#playInterphase();
        break;
      case 'prophase':
        phase = this.#playProphase();
        break;
      case 'metaphase':
        phase = this.#playMetaphase();
        break;
      case 'anaphase':
        phase = this.#playAnaphase();
        break;
      case 'telophase':
        phase = this.#playTelophase();
        break;
      default:
        phase = this.#playStartup();
        break;
    }

    this.#activeTweens = phase;
  }

  #setupGUI() {
    const phasesFolder = this.#gui.addFolder('Phases');

    const phasesConfig = {
      interphase: () => { this.#playPhase('interphase'); },
      prophase: () => { this.#playPhase('prophase'); },
      metaphase: () => { this.#playPhase('metaphase'); },
      anaphase: () => { this.#playPhase('anaphase'); },
      telophase: () => { this.#playPhase('telophase'); },
    };

    Object.keys(phasesConfig).forEach((phase) => {
      phasesFolder.add(phasesConfig, phase);
    });
  }
}

export default App;
