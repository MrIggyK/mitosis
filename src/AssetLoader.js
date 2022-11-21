import {
  REVISION,
  LoadingManager,
  HalfFloatType, TextureLoader,
} from 'three';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';

const THREE_PATH = `https://unpkg.com/three@0.${REVISION}.x`;
const DRACO_PATH = `${THREE_PATH}/examples/js/libs/draco/gltf/`;
const BASIS_PATH = `${THREE_PATH}/examples/js/libs/basis/`;

const getExtension = (url) => (url.split(/[#?]/)[0].split('.').pop().trim());

class AssetLoader {
  #loadingManager;
  #loaders;

  constructor() {
    this.#loadingManager = new LoadingManager();
    this.#createLoaderTable();
  }

  async load(url) {
    return new Promise((resolve, reject) => {
      const ext = getExtension(url);
      const loader = this.#loaders.get(ext);
      if (!loader) {
        reject(`Loader for extension ${ext} doesn't exist`);
      }
      loader.load(
        url,
        (result) => { resolve(result); },
        () => {},
        (error) => { reject(error); },
      );
    });
  }

  #createLoaderTable() {
    this.#loaders= new Map();
    this.#loaders.set('glb', this.#createGLTFLoader());
    this.#loaders.set('hdr', this.#createHDRTextureLoader());
    const textureLoader = this.#createTextureLoader();
    this.#loaders.set('jpg', textureLoader);
    this.#loaders.set('png', textureLoader);
  }

  #createGLTFLoader() {
    const loader = new GLTFLoader(this.#loadingManager);
    const decoder = new DRACOLoader(this.#loadingManager);
    decoder.setDecoderPath(DRACO_PATH);
    decoder.setWorkerLimit(4);
    loader.setDRACOLoader(decoder);
    loader.setMeshoptDecoder(MeshoptDecoder);
    return loader;
  }

  #createHDRTextureLoader() {
    const loader = new RGBELoader(this.#loadingManager);
    loader.setDataType(HalfFloatType);
    return loader;
  }

  #createTextureLoader() {
    return new TextureLoader(this.#loadingManager);
  }
}

export default AssetLoader;
