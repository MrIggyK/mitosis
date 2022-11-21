import GUI from 'lil-gui';
import {
  PerspectiveCamera,
  PMREMGenerator,
  REVISION,
  Scene,
  sRGBEncoding,
  WebGLRenderer,
  Color, MeshStandardMaterial, DoubleSide, SphereGeometry, Mesh, Group, CylinderGeometry,
} from 'three';
import AssetLoader from './AssetLoader.js';
import Stats from 'three/addons/libs/stats.module.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { MarchingCubes } from 'three/addons/objects/MarchingCubes.js';
import { TWEEN } from 'three/addons/libs/tween.module.min.js';

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

  constructor(containerID) {
    this.#gui = new GUI();

    this.#config = {
      envTexture: 'QA_03_white.hdr',
      resolution: 28,
      isolation: 80,
      speed: 0.5,
      color: '#ffff00',
      opacity: 0.3,
      bounds: 1.0,
      cells: [
        {
          position: [0, 0, 0],
          rotation: [0, 0, 0],
          nucleus: {
            position: [0, 0, 0],
            color: '#00ff00',
            opacity: 0.2,
            size: 0.07,
          },
          centrosome: {
            color: '#0000ff',
            position: [0.17, 0, 0],
            size: 0.04,
          },
        },
        {
          position: [0, 0, 0],
          rotation: [0, 0, 0],
          nucleus: {
            position: [0, 0, 0],
            color: '#00ff00',
            opacity: 0.2,
            size: 0.07,
          },
          centrosome: {
            color: '#0000ff',
            position: [0.17, 0, 0],
            size: 0.04,
          },
        },
      ],
    };

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

    const perfFolder = this.#gui.addFolder('Performance');
    const perfLi = document.createElement('li');
    perfLi.appendChild(this.#stats.domElement);
    perfLi.classList.add('gui-stats');
    perfFolder.domElement.appendChild(perfLi);

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

  async initScene() {
    const envTexture = await this.#assetLoader.load(`/assets/textures/${this.#config.envTexture}`);
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
    const displacementMap = await this.#assetLoader.load('/assets/textures/displacement.jpg');

    const {
      resolution,
      color,
      opacity,
      cells,
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

    return true;
  }

  #updateCells(time) {
    const { cells, bounds } = this.#config;

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

    this.#blobs.update();
  }

  async #playInterphase() {
    return new Promise((resolve) => {
      const { cells } = this.#config;
      const obj = {
        rotation: 0,
        nucleusOpacity: 0.2,
      };
      new TWEEN.Tween(obj)
        .to({
          rotation: Math.PI,
          nucleusOpacity: 0,
        }, 2000)
        .easing(TWEEN.Easing.Quadratic.InOut)
        .onUpdate(() => {
          cells[1].rotation = [0, 0, obj.rotation];
          cells[0].nucleus.opacity = obj.nucleusOpacity;
          cells[1].nucleus.opacity = obj.nucleusOpacity;
        })
        .onComplete(() => {
          resolve(true);
        })
        .start();
    });
  }

  async #playTelophase() {
    return new Promise((resolve) => {
      const { cells } = this.#config;
      const obj = {
        position: 0,
        nucleusOpacity: 0,
      };
      new TWEEN.Tween(obj)
        .to({
          position: 0.3,
          nucleusOpacity: 0.1,
        }, 2000)
        .easing(TWEEN.Easing.Quadratic.InOut)
        .onUpdate(() => {
          cells[0].position = [obj.position, 0, 0];
          cells[1].position = [-obj.position, 0, 0];
          cells[0].nucleus.opacity = obj.nucleusOpacity;
          cells[1].nucleus.opacity = obj.nucleusOpacity;
        })
        .onComplete(() => {
          resolve(true);
        })
        .start();
    });
  }

  #setupGUI() {
    const phasesFolder = this.#gui.addFolder('Phases');

    const phasesConfig = {
      interphase: () => { this.#playInterphase(); },
      telophase: () => { this.#playTelophase(); },
    };

    Object.keys(phasesConfig).forEach((phase) => {
      phasesFolder.add(phasesConfig, phase);
    });
  }
}

export default App;
