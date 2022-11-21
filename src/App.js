import GUI from 'lil-gui';
import {
  PerspectiveCamera,
  PMREMGenerator,
  REVISION,
  Scene,
  sRGBEncoding,
  WebGLRenderer,
  Color, MeshStandardMaterial, DoubleSide, SphereGeometry, Mesh, Group,
} from 'three';
import AssetLoader from './AssetLoader.js';
import Stats from 'three/addons/libs/stats.module.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { MarchingCubes } from 'three/addons/objects/MarchingCubes.js';

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
      speed: 0.1,
      color: '#ffffff',
      opacity: 0.3,
      cells: [
        {
          position: [0, 0, 0],
          nucleus: {
            color: '#0000ff',
            size: 0.08,
            opacity: 0.2,
          },
        },
        {
          position: [0, 0, 0],
          nucleus: {
            color: '#0000ff',
            size: 0.08,
            opacity: 0.2,
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
    this.#camera.position.set(0, 0, 3);
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

    const calcTime = (time / 1000.0) * this.#config.speed;
    this.#updateCells(calcTime);

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
      } = cell;

      const nucleusGeometry = new SphereGeometry(1);
      const nucleusMaterial = new MeshStandardMaterial({
        color: nucleus.color,
        opacity: nucleus.opacity,
        transparent: true,
        displacementMap,
      });

      const cellObj = new Group();
      const cellMesh = new Mesh(nucleusGeometry, nucleusMaterial);
      cellMesh.renderOrder = -1;
      cellObj.add(cellMesh);
      cellObj.name = `nucleus${index}`;
      cellObj.scale.set(nucleus.size, nucleus.size, nucleus.size);
      cellsObj.add(cellObj);
    });

    return true;
  }

  #updateCells(time) {
    const { cells } = this.#config;

    const posX = Math.sin(time * Math.PI * 2.0) * 0.5;
    cells[0].position = [posX, 0, 0];
    cells[1].position = [-posX, 0, 0];

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
      const { position } = cell;
      this.#blobs.addBall(0.5 + position[0] / 2.0, 0.5 + position[1], 0.5 + position[2], strength, subtract);

      const nucleusObj = this.#scene.getObjectByName(`nucleus${index}`);
      nucleusObj.position.set(...position);
    });

    this.#blobs.update();
  }

  #setupGUI() {

  }
}

export default App;
