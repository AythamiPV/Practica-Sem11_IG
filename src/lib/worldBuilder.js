import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { createRigidBody, Ammo } from "./physics.js";

// Materiales actualizados con texturas
const materials = {
  movable: new THREE.MeshBasicMaterial({ color: 0x8b4513 }),
  immovable: new THREE.MeshBasicMaterial({ color: 0x808080 }),
  rock: new THREE.MeshBasicMaterial({ color: 0x777777 }),
  bomb: new THREE.MeshBasicMaterial({ color: 0x000000 }),
  enemy: new THREE.MeshBasicMaterial({ color: 0x000000 }),
  wood: new THREE.MeshBasicMaterial({ color: 0x8b4513 }),
  metal: new THREE.MeshBasicMaterial({ color: 0x666666 }),
  ground: null,
  mountain: null,
};

// Cargar texturas
let texturesLoaded = false;
const textureLoader = new THREE.TextureLoader();
const gltfLoader = new GLTFLoader();

// Función para cargar texturas
function loadTextures() {
  if (texturesLoaded) return Promise.resolve();

  return new Promise((resolve) => {
    // Textura de césped
    const grassTexture = textureLoader.load(
      "https://threejs.org/examples/textures/terrain/grasslight-big.jpg",
      () => {
        grassTexture.wrapS = grassTexture.wrapT = THREE.RepeatWrapping;
        grassTexture.repeat.set(20, 20);

        materials.ground = new THREE.MeshBasicMaterial({
          map: grassTexture,
          color: 0x7cfc00,
        });

        // Textura de roca para montañas
        const rockTexture = textureLoader.load(
          "https://threejs.org/examples/textures/terrain/rock.png",
          () => {
            rockTexture.wrapS = rockTexture.wrapT = THREE.RepeatWrapping;
            rockTexture.repeat.set(4, 4);

            materials.mountain = new THREE.MeshBasicMaterial({
              map: rockTexture,
              color: 0x888888,
            });

            texturesLoaded = true;
            resolve();
          },
          undefined,
          (error) => {
            console.error("Error cargando textura de roca:", error);
            materials.mountain = new THREE.MeshBasicMaterial({
              color: 0x888888,
            });
            texturesLoaded = true;
            resolve();
          }
        );
      },
      undefined,
      (error) => {
        console.error("Error cargando textura de césped:", error);
        materials.ground = new THREE.MeshBasicMaterial({ color: 0x7cfc00 });
        materials.mountain = new THREE.MeshBasicMaterial({ color: 0x888888 });
        texturesLoaded = true;
        resolve();
      }
    );
  });
}

export function createGround(scene) {
  // Asegurar que las texturas estén cargadas
  if (!materials.ground) {
    materials.ground = new THREE.MeshBasicMaterial({ color: 0x7cfc00 });
  }

  // Terreno principal plano (con física)
  const groundSize = 100;
  const groundGeometry = new THREE.PlaneGeometry(
    groundSize,
    groundSize,
    32,
    32
  );
  const ground = new THREE.Mesh(groundGeometry, materials.ground);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = 0;
  ground.receiveShadow = true;

  if (Ammo) {
    const groundShape = new Ammo.btBoxShape(
      new Ammo.btVector3(groundSize / 2, 0.5, groundSize / 2)
    );
    const pos = new THREE.Vector3(0, -0.5, 0);
    const quat = new THREE.Quaternion(0, 0, 0, 1);
    createRigidBody(ground, groundShape, 0, pos, quat);
  }

  scene.add(ground);

  // Crear montañas decorativas alrededor
  createMountains(scene, groundSize);

  return ground;
}

function createMountains(scene, groundSize) {
  // Cargar texturas primero si no están cargadas
  loadTextures().then(() => {
    // Crear un anillo de montañas alrededor del terreno - MUCHO MÁS ALEJADAS
    const innerRingRadius = groundSize * 1.5; // 150 unidades desde centro
    const outerRingRadius = groundSize * 2.0; // 200 unidades desde centro
    const numMountains = 32; // Más montañas para cubrir más área

    for (let i = 0; i < numMountains; i++) {
      const angle = (i / numMountains) * Math.PI * 2;

      // Posición en anillo (entre radio interno y externo)
      const radius =
        innerRingRadius + Math.random() * (outerRingRadius - innerRingRadius);
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;

      // Variar altura y tamaño - montañas más grandes al estar más lejos
      const distanceFactor = radius / innerRingRadius;
      const baseHeight = 20 * distanceFactor;
      const height = baseHeight + Math.random() * 30 * distanceFactor;
      const width = 10 * distanceFactor + Math.random() * 15 * distanceFactor;
      const depth = 10 * distanceFactor + Math.random() * 15 * distanceFactor;

      // Crear montaña
      const mountain = createMountain(x, z, width, height, depth, angle);
      scene.add(mountain);
    }

    // Montañas más grandes en las esquinas - MUCHO MÁS ALEJADAS
    const cornerDistance = groundSize * 1.8; // 180 unidades
    createCornerMountain(scene, cornerDistance, cornerDistance, 35, 45); // Esquina NE
    createCornerMountain(scene, -cornerDistance, cornerDistance, 35, 45); // Esquina NW
    createCornerMountain(scene, cornerDistance, -cornerDistance, 35, 45); // Esquina SE
    createCornerMountain(scene, -cornerDistance, -cornerDistance, 35, 45); // Esquina SW

    // Montañas extra grandes para horizonte - MUY ALEJADAS
    const horizonDistance = groundSize * 2.2; // 220 unidades
    createLargeMountain(scene, 0, horizonDistance, 50, 60); // Norte
    createLargeMountain(scene, 0, -horizonDistance, 50, 60); // Sur
    createLargeMountain(scene, horizonDistance, 0, 50, 60); // Este
    createLargeMountain(scene, -horizonDistance, 0, 50, 60); // Oeste

    // Montañas diagonales adicionales
    const diagDistance = groundSize * 1.9;
    const diagOffset = diagDistance * Math.cos(Math.PI / 4);
    createMediumMountain(scene, diagOffset, diagOffset, 30, 40); // NE diagonal
    createMediumMountain(scene, -diagOffset, diagOffset, 30, 40); // NW diagonal
    createMediumMountain(scene, diagOffset, -diagOffset, 30, 40); // SE diagonal
    createMediumMountain(scene, -diagOffset, -diagOffset, 30, 40); // SW diagonal
  });
}

function createMountain(x, z, width, height, depth, rotation) {
  // Geometría de montaña (cono para simular pico)
  const geometry = new THREE.ConeGeometry(width / 2, height, 8, 1);
  const mountain = new THREE.Mesh(geometry, materials.mountain);

  // Posicionar
  mountain.position.set(x, height / 2, z);
  mountain.rotation.y = rotation;

  // Añadir nieve en la cima para montañas altas
  if (height > 35) {
    const snowHeight = height * 0.15;
    const snowGeometry = new THREE.ConeGeometry(width / 3, snowHeight, 8, 1);
    const snow = new THREE.Mesh(
      snowGeometry,
      new THREE.MeshBasicMaterial({ color: 0xf0f8ff })
    ); // Azul nieve
    snow.position.set(0, height - snowHeight / 2, 0);
    mountain.add(snow);
  }

  // Marcar como decorativo (sin física)
  mountain.userData.isDecorative = true;
  mountain.userData.type = "mountain";

  return mountain;
}

function createMediumMountain(scene, x, z, baseSize, height) {
  const group = new THREE.Group();

  // Base
  const baseGeometry = new THREE.CylinderGeometry(
    baseSize,
    baseSize * 1.3,
    height * 0.5,
    10,
    1
  );
  const base = new THREE.Mesh(baseGeometry, materials.mountain);
  base.position.y = height * 0.25;

  // Pico
  const peakGeometry = new THREE.ConeGeometry(
    baseSize * 0.5,
    height * 0.6,
    8,
    1
  );
  const peak = new THREE.Mesh(peakGeometry, materials.mountain);
  peak.position.y = height * 0.5 + height * 0.3;

  group.add(base, peak);
  group.position.set(x, 0, z);

  // Rotar aleatoriamente
  group.rotation.y = Math.random() * Math.PI * 2;

  // Nieves en la cima
  if (height > 30) {
    const snowGeometry = new THREE.ConeGeometry(
      baseSize * 0.4,
      height * 0.1,
      8,
      1
    );
    const snow = new THREE.Mesh(
      snowGeometry,
      new THREE.MeshBasicMaterial({ color: 0xf0f8ff })
    );
    snow.position.y = height * 0.5 + height * 0.6 - height * 0.05;
    group.add(snow);
  }

  group.userData.isDecorative = true;
  group.userData.type = "mountain";

  scene.add(group);
  return group;
}

function createCornerMountain(scene, x, z, baseSize, height) {
  const group = new THREE.Group();

  // Base amplia
  const baseGeometry = new THREE.CylinderGeometry(
    baseSize,
    baseSize * 1.6,
    height * 0.5,
    12,
    1
  );
  const base = new THREE.Mesh(baseGeometry, materials.mountain);
  base.position.y = height * 0.25;

  // Cuerpo principal
  const bodyGeometry = new THREE.ConeGeometry(
    baseSize * 0.8,
    height * 0.7,
    10,
    1
  );
  const body = new THREE.Mesh(bodyGeometry, materials.mountain);
  body.position.y = height * 0.5 + height * 0.35;

  // Pico
  const peakGeometry = new THREE.ConeGeometry(
    baseSize * 0.3,
    height * 0.3,
    8,
    1
  );
  const peak = new THREE.Mesh(peakGeometry, materials.mountain);
  peak.position.y = height * 0.5 + height * 0.7 + height * 0.15;

  group.add(base, body, peak);
  group.position.set(x, 0, z);

  // Rotar para que se vea bien desde la catapulta
  const angleToCenter = Math.atan2(-z, -x);
  group.rotation.y = angleToCenter + Math.PI / 4;

  // Gran capa de nieve
  const snowGeometry = new THREE.ConeGeometry(
    baseSize * 0.25,
    height * 0.15,
    8,
    1
  );
  const snow = new THREE.Mesh(
    snowGeometry,
    new THREE.MeshBasicMaterial({ color: 0xf0f8ff })
  );
  snow.position.y =
    height * 0.5 + height * 0.7 + height * 0.15 - height * 0.075;
  group.add(snow);

  group.userData.isDecorative = true;
  group.userData.type = "mountain";
  group.userData.isLarge = true;

  scene.add(group);
  return group;
}

function createLargeMountain(scene, x, z, baseSize, height) {
  const group = new THREE.Group();

  // Base muy amplia
  const baseGeometry = new THREE.CylinderGeometry(
    baseSize * 1.5,
    baseSize * 2.0,
    height * 0.4,
    16,
    1
  );
  const base = new THREE.Mesh(baseGeometry, materials.mountain);
  base.position.y = height * 0.2;

  // Cuerpo principal
  const bodyGeometry = new THREE.ConeGeometry(baseSize, height * 0.8, 12, 1);
  const body = new THREE.Mesh(bodyGeometry, materials.mountain);
  body.position.y = height * 0.4 + height * 0.4;

  // Pico múltiple (crear varios picos)
  const numPeaks = 3;
  for (let i = 0; i < numPeaks; i++) {
    const peakSize = baseSize * (0.2 + Math.random() * 0.1);
    const peakHeight = height * (0.1 + Math.random() * 0.1);
    const peakOffset = (Math.random() - 0.5) * baseSize * 0.5;

    const peakGeometry = new THREE.ConeGeometry(peakSize, peakHeight, 6, 1);
    const peak = new THREE.Mesh(peakGeometry, materials.mountain);
    peak.position.set(
      peakOffset,
      height * 0.4 + height * 0.8 + peakHeight / 2,
      0
    );
    group.add(peak);

    // Nieve en picos
    const snowGeometry = new THREE.ConeGeometry(
      peakSize * 0.8,
      peakHeight * 0.3,
      6,
      1
    );
    const snow = new THREE.Mesh(
      snowGeometry,
      new THREE.MeshBasicMaterial({ color: 0xf0f8ff })
    );
    snow.position.set(peakOffset, height * 0.4 + height * 0.8 + peakHeight, 0);
    group.add(snow);
  }

  group.add(base, body);
  group.position.set(x, 0, z);

  // Orientar hacia el centro
  const angleToCenter = Math.atan2(-z, -x);
  group.rotation.y = angleToCenter;

  group.userData.isDecorative = true;
  group.userData.type = "mountain";
  group.userData.isLarge = true;

  scene.add(group);
  return group;
}

// ... (el resto del código se mantiene igual)

export function createBrick(type, position, rotation = 0, isStable = true) {
  const isMovable = type === "movable";
  const isVertical = rotation === 90;

  let size;
  if (isVertical) {
    // Ladrillo vertical: 0.6 (ancho) x 1.2 (alto) x 0.6 (profundo)
    size = { x: 0.6, y: 1.2, z: 0.6 };
  } else {
    // Ladrillo horizontal: 1.2 (largo) x 0.6 (alto) x 0.6 (ancho)
    size = { x: 1.2, y: 0.6, z: 0.6 };
  }

  // Material con textura para ladrillos
  let brickMaterial;
  if (isMovable) {
    // Ladrillo marrón con textura de madera
    brickMaterial = new THREE.MeshBasicMaterial({
      color: 0x8b4513,
      map: createBrickTexture(0x8b4513, isVertical),
    });
  } else {
    // Ladrillo gris con textura de piedra
    brickMaterial = new THREE.MeshBasicMaterial({
      color: 0x808080,
      map: createBrickTexture(0x808080, isVertical),
    });
  }

  const brick = new THREE.Mesh(
    new THREE.BoxGeometry(size.x, size.y, size.z),
    brickMaterial
  );

  // La posición ya viene calculada con el centro correcto desde levels.js
  brick.position.copy(position);
  brick.castShadow = true;
  brick.receiveShadow = true;
  brick.userData.type = "brick";
  brick.userData.brickType = type;
  brick.userData.isVertical = isVertical;
  brick.userData.rotation = rotation;

  if (Ammo) {
    const mass = isMovable ? 2 : 0;
    const shape = new Ammo.btBoxShape(
      new Ammo.btVector3(size.x / 2, size.y / 2, size.z / 2)
    );

    // Crear cuaternión para la rotación
    const quat = new THREE.Quaternion();
    if (isVertical) {
      // Para ladrillos verticales, rotar 90 grados en X
      quat.setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
    }

    const physicsPos = new THREE.Vector3().copy(position);
    const isStaticStart = isStable && isMovable;

    createRigidBody(
      brick,
      shape,
      mass,
      physicsPos,
      quat,
      null,
      null,
      isStaticStart
    );
  }

  return brick;
}

// Función para crear texturas simples para ladrillos
function createBrickTexture(baseColor, isVertical) {
  // Crear un canvas para la textura
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");

  // Color base
  ctx.fillStyle = `rgb(${(baseColor >> 16) & 255}, ${(baseColor >> 8) & 255}, ${
    baseColor & 255
  })`;
  ctx.fillRect(0, 0, 64, 64);

  // Añadir patron de ladrillo
  ctx.fillStyle = "rgba(0, 0, 0, 0.1)";

  if (isVertical) {
    // Patrón para ladrillos verticales
    for (let x = 0; x < 64; x += 16) {
      ctx.fillRect(x, 0, 8, 64);
    }
    for (let y = 0; y < 64; y += 16) {
      ctx.fillRect(0, y, 64, 4);
    }
  } else {
    // Patrón para ladrillos horizontales
    for (let y = 0; y < 64; y += 16) {
      ctx.fillRect(0, y, 64, 8);
    }
    for (let x = 0; x < 64; x += 32) {
      ctx.fillRect(x, 0, 4, 64);
    }
  }

  // Crear textura desde el canvas
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(isVertical ? 2 : 4, isVertical ? 4 : 2);

  return texture;
}

export function createEnemy(position) {
  const group = new THREE.Group();

  // Cabeza
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.3, 8, 8),
    materials.enemy
  );
  head.position.y = 0.8;

  // Cuerpo
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.1, 0.1, 1, 8),
    materials.enemy
  );
  body.position.y = 0.3;

  // Brazos
  const armGeometry = new THREE.CylinderGeometry(0.05, 0.05, 0.8, 6);
  const leftArm = new THREE.Mesh(armGeometry, materials.enemy);
  leftArm.position.set(0.4, 0.6, 0);
  leftArm.rotation.z = Math.PI / 4;

  const rightArm = new THREE.Mesh(armGeometry, materials.enemy);
  rightArm.position.set(-0.4, 0.6, 0);
  rightArm.rotation.z = -Math.PI / 4;

  // Piernas
  const legGeometry = new THREE.CylinderGeometry(0.08, 0.08, 0.8, 6);
  const leftLeg = new THREE.Mesh(legGeometry, materials.enemy);
  leftLeg.position.set(0.15, -0.2, 0);
  leftLeg.rotation.z = Math.PI / 8;

  const rightLeg = new THREE.Mesh(legGeometry, materials.enemy);
  rightLeg.position.set(-0.15, -0.2, 0);
  rightLeg.rotation.z = -Math.PI / 8;

  group.add(head, body, leftArm, rightArm, leftLeg, rightLeg);
  group.position.copy(position);
  group.userData.type = "enemy";

  if (Ammo) {
    const shape = new Ammo.btSphereShape(0.5);
    const mass = 1;
    const quat = new THREE.Quaternion();
    createRigidBody(group, shape, mass, position, quat);
  }

  return group;
}

export function createProjectile(type, position, velocity = null) {
  const isBomb = type === "bomb";
  const radius = isBomb ? 0.4 : 0.35;

  const geometry = isBomb
    ? new THREE.SphereGeometry(radius, 16, 16)
    : new THREE.SphereGeometry(radius, 12, 8);

  const material = isBomb ? materials.bomb : materials.rock;
  const projectile = new THREE.Mesh(geometry, material);
  projectile.position.copy(position);
  projectile.castShadow = true;
  projectile.userData.type = "projectile";
  projectile.userData.projectileType = type;
  projectile.userData.isBomb = isBomb;

  if (Ammo) {
    const shape = new Ammo.btSphereShape(radius);
    const mass = isBomb ? 0.8 : 1.2;
    const quat = new THREE.Quaternion();

    createRigidBody(projectile, shape, mass, position, quat, velocity);
  }

  return projectile;
}

export function createCatapult(position = new THREE.Vector3(-25, 0, 0)) {
  const group = new THREE.Group();
  group.position.copy(position);

  // Datos de la catapulta
  group.userData.type = "catapult";
  group.userData.angle = 45;
  group.userData.power = 50;
  group.userData.baseRotation = 0;
  group.userData.loaded = false;
  group.userData.cup = null; // Se asignará cuando se cargue el modelo

  // Crear catapulta simple temporal mientras carga el modelo
  createSimpleCatapult(group);

  // Intentar cargar modelo 3D de catapulta
  loadCatapultModel(group).then((success) => {
    if (success) {
      console.log("Modelo 3D de catapulta cargado exitosamente");
    } else {
      console.log("Usando catapulta simple (fallback)");
    }
  });

  return group;
}

function createSimpleCatapult(group) {
  // Catapulta simple (fallback si no carga el modelo 3D)

  // Base
  const baseGeometry = new THREE.BoxGeometry(4, 0.6, 3);
  const base = new THREE.Mesh(baseGeometry, materials.wood);
  base.position.y = 0.3;

  // Ruedas
  const wheelGeometry = new THREE.CylinderGeometry(0.5, 0.5, 0.3, 16);
  const leftWheel = new THREE.Mesh(wheelGeometry, materials.metal);
  leftWheel.position.set(-1.5, 0.5, 1.2);
  leftWheel.rotation.z = Math.PI / 2;

  const rightWheel = new THREE.Mesh(wheelGeometry, materials.metal);
  rightWheel.position.set(1.5, 0.5, 1.2);
  rightWheel.rotation.z = Math.PI / 2;

  const leftWheelBack = new THREE.Mesh(wheelGeometry, materials.metal);
  leftWheelBack.position.set(-1.5, 0.5, -1.2);
  leftWheelBack.rotation.z = Math.PI / 2;

  const rightWheelBack = new THREE.Mesh(wheelGeometry, materials.metal);
  rightWheelBack.position.set(1.5, 0.5, -1.2);
  rightWheelBack.rotation.z = Math.PI / 2;

  // Brazo
  const armGroup = new THREE.Group();
  armGroup.name = "catapultArm";

  const armGeometry = new THREE.BoxGeometry(0.3, 5, 0.3);
  const arm = new THREE.Mesh(armGeometry, materials.wood);
  arm.position.y = 2.5;

  // Copa en el extremo del brazo
  const cupGeometry = new THREE.SphereGeometry(0.5, 8, 8);
  const cup = new THREE.Mesh(cupGeometry, materials.metal);
  cup.name = "catapultCup";
  cup.position.set(0, 5, 0);
  cup.scale.set(0.9, 0.4, 0.9);

  // Contrapeso
  const counterweightGeometry = new THREE.BoxGeometry(1.5, 1.2, 1);
  const counterweight = new THREE.Mesh(counterweightGeometry, materials.metal);
  counterweight.position.set(0, -1, 0);

  armGroup.add(arm, cup, counterweight);
  armGroup.position.set(0, 1.5, 0);
  armGroup.rotation.z = -Math.PI / 6;

  // Eje
  const axleGeometry = new THREE.CylinderGeometry(0.15, 0.15, 2, 8);
  const axle = new THREE.Mesh(axleGeometry, materials.metal);
  axle.position.set(0, 1.5, 0);
  axle.rotation.z = Math.PI / 2;

  group.add(
    base,
    leftWheel,
    rightWheel,
    leftWheelBack,
    rightWheelBack,
    axle,
    armGroup
  );

  // Guardar referencia a la copa
  group.userData.cup = cup;
  group.userData.armGroup = armGroup;
  group.userData.isSimple = true;
}

async function loadCatapultModel(group) {
  try {
    // Usar TU modelo local catapult.glb
    const modelUrl = '/models/catapult.glb'; // Ruta relativa desde tu carpeta public
    console.log("Cargando modelo de catapulta desde:", modelUrl);
    
    const gltf = await gltfLoader.loadAsync(modelUrl);
    
    // Limpiar catapulta simple si existe
    while (group.children.length > 0) {
      group.remove(group.children[0]);
    }
    
    // Añadir el modelo cargado
    const model = gltf.scene;
    
    // Ajustar posición, escala y rotación
    model.position.set(0, 0, 0);
    model.scale.set(0.5, 0.5, 0.5); // Ajusta según necesites
    model.rotation.y = Math.PI; // Rotar 180° si el modelo mira hacia atrás
    
    // Buscar la copa en el modelo (puede tener nombre diferente)
    let cup = null;
    let armGroup = null;
    
    // Intenta encontrar partes por nombre
    model.traverse((child) => {
      if (child.isMesh) {
        // Buscar la parte que actuará como copa
        if (child.name.toLowerCase().includes('cup') || 
            child.name.toLowerCase().includes('bowl') ||
            child.name.toLowerCase().includes('spoon')) {
          cup = child;
          console.log("Copa encontrada:", child.name);
        }
        
        // Buscar el brazo o grupo principal
        if (child.name.toLowerCase().includes('arm') ||
            child.name.toLowerCase().includes('throw')) {
          armGroup = child;
        }
      }
    });
    
    // Si no encuentra copa, crear una simple
    if (!cup) {
      console.log("Creando copa artificial...");
      const cupGeometry = new THREE.SphereGeometry(0.3, 8, 8);
      cup = new THREE.Mesh(cupGeometry, materials.metal);
      cup.name = "catapultCup";
      cup.position.set(0, 2, 0); // Posición aproximada
      model.add(cup);
    }
    
    // Si no encuentra brazo, usar el modelo completo
    if (!armGroup) {
      armGroup = model;
    }
    
    // Añadir física básica a la catapulta
    if (Ammo) {
      const shape = new Ammo.btBoxShape(new Ammo.btVector3(2, 1, 1.5));
      const mass = 0; // Masa 0 = objeto estático
      const pos = new THREE.Vector3(0, 1, 0);
      const quat = new THREE.Quaternion();
      createRigidBody(model, shape, mass, pos, quat);
    }
    
    group.add(model);
    
    // Guardar referencias importantes
    group.userData.cup = cup;
    group.userData.armGroup = armGroup;
    group.userData.model3D = model;
    group.userData.isGLBModel = true;
    
    console.log("Modelo GLB cargado exitosamente");
    return true;
    
  } catch (error) {
    console.error("Error cargando modelo 3D de catapulta:", error);
    
    // Fallback a catapulta simple
    console.log("Usando catapulta simple (fallback)");
    createSimpleCatapult(group);
    return false;
  }
}
