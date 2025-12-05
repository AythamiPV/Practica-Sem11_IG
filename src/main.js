import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import {
  initPhysics,
  updatePhysics,
  createExplosion,
  removeRigidBody,
  getRigidBodies,
  checkCollisions,
  stabilizeObjects,
  getPhysicsWorld,
} from "./lib/physics.js";
import {
  createGround,
  createBrick,
  createEnemy,
  createProjectile,
  loadCatapultModel,
} from "./lib/worldBuilder.js";
import { levels } from "./lib/levels.js";
import {
  handleInput,
  updateCatapult,
  getProjectileStartPosition,
  getLaunchVelocity,
  projectileType,
  angle,
  power,
  resetInputState,
  inputEnabled,
  MAX_POWER, // Añadido
  MIN_POWER, // Añadido si lo necesitas
} from "./lib/controls.js";
import {
  initUI,
  updateHUD,
  updateLevelInfo,
  showLevelComplete,
  showGameOver,
} from "./lib/ui.js";

// Al principio de main.js, con las otras variables:
let scene, renderer, orbitControls;
let currentLevel = 0;
let ammo = { rock: 0, bomb: 0 };
let ammoUsed = { rock: 0, bomb: 0 };
let clock = new THREE.Clock();
let catapultCamera, orbitCamera, activeCamera;
let isGameRunning = false;
let levelStartTime = 0;
let catapult = null;
let catapultConfig = null; // <-- AÑADE ESTA LÍNEA
let trajectoryLine = null;
let enemies = [];
let projectiles = [];
let bricks = [];

// Inicialización de eventos
window.addEventListener("keydown", (e) => handleInput(e));
window.addEventListener("keyup", (e) => handleInput(e));

// Iniciar juego
startGame();

async function startGame() {
  console.log("Iniciando juego...");

  try {
    await initPhysics();
    console.log("Física inicializada");
  } catch (error) {
    console.error("Error inicializando física:", error);
  }

  initGraphics();
  initUI(startLevel);
}

function initGraphics() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87ceeb);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  document.getElementById("app").appendChild(renderer.domElement);

  // Configurar cámaras - más altas para ver montañas
  catapultCamera = new THREE.PerspectiveCamera(
    75, // Aumentado FOV para ver más
    window.innerWidth / window.innerHeight,
    0.1,
    2000 // Mayor distancia de renderizado
  );
  catapultCamera.position.set(-25, 12, 25); // Más alto

  orbitCamera = new THREE.PerspectiveCamera(
    75, // Aumentado FOV
    window.innerWidth / window.innerHeight,
    0.1,
    2000 // Mayor distancia
  );
  orbitCamera.position.set(40, 60, 40); // Mucho más alto para ver montañas
  orbitCamera.lookAt(0, 0, 0);

  activeCamera = catapultCamera;

  // Controles orbitales
  orbitControls = new OrbitControls(orbitCamera, renderer.domElement);
  orbitControls.enableDamping = true;
  orbitControls.dampingFactor = 0.05;
  orbitControls.enabled = false;
  orbitControls.maxDistance = 300; // Permitir zoom out más
  orbitControls.minDistance = 20;
  orbitControls.maxPolarAngle = Math.PI / 2; // No mirar desde abajo

  // Crear línea de trayectoria
  const trajectoryMaterial = new THREE.LineDashedMaterial({
    color: 0xff0000,
    linewidth: 2,
    dashSize: 0.5,
    gapSize: 0.2,
  });
  const trajectoryGeometry = new THREE.BufferGeometry();
  trajectoryLine = new THREE.Line(trajectoryGeometry, trajectoryMaterial);
  scene.add(trajectoryLine);
  trajectoryLine.visible = false;

  // Luces
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
  scene.add(ambientLight);

  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
  directionalLight.position.set(10, 20, 5);
  directionalLight.castShadow = true;
  directionalLight.shadow.mapSize.width = 2048;
  directionalLight.shadow.mapSize.height = 2048;
  directionalLight.shadow.camera.left = -30;
  directionalLight.shadow.camera.right = 30;
  directionalLight.shadow.camera.top = 30;
  directionalLight.shadow.camera.bottom = -30;
  directionalLight.shadow.camera.far = 100;
  scene.add(directionalLight);

  // Eventos
  window.addEventListener("resize", onWindowResize);
  window.addEventListener("keydown", (e) => {
    if (e.code === "KeyV") {
      toggleCamera();
    } else if (e.code === "Space" && inputEnabled && isGameRunning) {
      shootProjectile();
    } else if (e.code === "KeyR") {
      // Reiniciar nivel (para debug)
      startLevel();
    }
  });
}

function onWindowResize() {
  activeCamera.aspect = window.innerWidth / window.innerHeight;
  activeCamera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function toggleCamera() {
  if (activeCamera === catapultCamera) {
    activeCamera = orbitCamera;
    orbitControls.enabled = true;
    trajectoryLine.visible = false;
  } else {
    activeCamera = catapultCamera;
    orbitControls.enabled = false;
    trajectoryLine.visible = true;
  }
}

async function startLevel() {
  console.log(
    `Cargando nivel ${currentLevel + 1}: ${levels[currentLevel].difficulty}`
  );

  // Limpiar escena
  while (scene.children.length > 0) {
    scene.remove(scene.children[0]);
  }

  // Reiniciar arrays
  enemies = [];
  projectiles = [];
  bricks = [];
  resetInputState();

  // Restaurar luces básicas
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
  scene.add(ambientLight);

  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
  directionalLight.position.set(10, 20, 5);
  directionalLight.castShadow = true;
  scene.add(directionalLight);

  // Crear terreno
  createGround(scene);

  // OBTENER EL PHYSICS WORLD
  const physicsWorld = getPhysicsWorld();

  if (!physicsWorld) {
    console.error(
      "ERROR: physicsWorld no está inicializado. ¿Has llamado a initPhysics()?"
    );
    return;
  }

  catapultConfig = await loadCatapultModel(scene, physicsWorld);

  if (!catapultConfig) {
    console.error("ERROR: No se pudo crear la catapulta");
    return;
  }

  // Obtener el objeto 3D de la catapulta
  catapult = catapultConfig.group;

  // ¡IMPORTANTE! Copiar TODAS las propiedades de catapultConfig a userData
  catapult.userData = {
    ...catapult.userData,
    ...catapultConfig, // Esto copia todas las propiedades: barrelGroup, muzzle, etc.
    type: catapultConfig.type || "pirate-cannon", // Asegurar que tiene type
    angle: 45,
    power: 30,
    baseRotation: 279.7,
    currentElevation: Math.PI / 4, // 45° inicial
  };

  // Cargar nivel
  const level = levels[currentLevel];
  ammo = { ...level.ammo };
  ammoUsed = { rock: 0, bomb: 0 };

  updateLevelInfo(currentLevel, level.difficulty);

  // Crear ladrillos
  console.log(`Creando ${level.bricks.length} ladrillos...`);
  for (const brickData of level.bricks) {
    const rotation = brickData.rotation || 0;
    const brick = createBrick(
      brickData.type,
      new THREE.Vector3(...brickData.pos),
      rotation,
      true
    );
    scene.add(brick);
    bricks.push(brick);
  }

  // Crear enemigos
  console.log(`Creando ${level.enemies.length} enemigos...`);
  for (const enemyData of level.enemies) {
    const enemy = createEnemy(new THREE.Vector3(...enemyData.pos));
    scene.add(enemy);
    enemies.push(enemy);
  }

  // Estabilizar objetos al inicio
  setTimeout(() => {
    console.log("Iniciando estabilización...");
    stabilizeObjects();
    console.log("Nivel completamente estabilizado y listo");

    // Información sobre la catapulta
    setTimeout(() => {
      if (isGameRunning) {
        const catapultType = catapultConfig.type || "Desconocida";
        console.log(
          `Catapulta ${catapultType} cargada. Potencia máxima: ${MAX_POWER}`
        );
      }
    }, 500);
  }, 200);

  // Restaurar línea de trayectoria
  scene.add(trajectoryLine);
  trajectoryLine.visible = true;

  // Iniciar juego
  isGameRunning = true;
  levelStartTime = Date.now();
  updateHUD(ammo, angle, power, projectileType, MAX_POWER);

  animate();
}

function shootProjectile() {
  if (!catapult || !isGameRunning) return;

  // Verificar munición
  if (ammo[projectileType] <= 0) {
    checkGameOver();
    return;
  }

  // Usar munición
  ammo[projectileType]--;
  ammoUsed[projectileType]++;

  const startPos = getProjectileStartPosition(catapult);
  const velocity = getLaunchVelocity(catapult);

  const projectile = createProjectile(projectileType, startPos, velocity);
  scene.add(projectile);
  projectiles.push(projectile);

  // INICIALIZAR DATOS PARA BOMBAS - ¡IMPORTANTE!
  if (projectileType === "bomb") {
    projectile.userData.hasExploded = false;
    projectile.userData.collisionRadius = 0.45; // Radio de colisión específico para bombas
    console.log(`💣 Bomba lanzada - ID: ${projectile.id}`);
  }

  updateHUD(ammo, angle, power, projectileType);
}

function handleBombExplosion(projectile) {
  // Verificar que la bomba no haya explotado ya
  if (
    projectile.userData.hasExploded === true &&
    projectile.userData.explosionTriggered
  ) {
    console.log(`⚠️ Esta bomba ya explotó, ignorando...`);
    return;
  }

  // Marcar como explotada y que ya se disparó la explosión
  projectile.userData.hasExploded = true;
  projectile.userData.explosionTriggered = true;

  console.log(`💥 EXPLOSIÓN de bomba en posición:`, projectile.position);

  // Crear explosión con parámetros
  const explosionRadius = 8;
  const explosionForce = 40;

  const affectedEnemies = createExplosion(
    projectile.position,
    explosionRadius,
    explosionForce
  );

  // Eliminar enemigos afectados
  affectedEnemies.forEach((enemy) => {
    console.log(`🔥 Enemigo afectado por explosión`);
    removeEnemy(enemy);
  });

  // También verificar enemigos cercanos manualmente
  for (let i = enemies.length - 1; i >= 0; i--) {
    const enemy = enemies[i];
    const distance = enemy.position.distanceTo(projectile.position);

    if (distance < explosionRadius * 0.7) {
      console.log(
        `🔥 Enemigo en rango de explosión (dist: ${distance.toFixed(2)})`
      );
      removeEnemy(enemy);
    }
  }

  // Crear efecto visual
  createExplosionEffect(projectile.position);

  // Eliminar proyectil
  removeProjectile(projectile);
}

function createExplosionEffect(position) {
  const explosionGeometry = new THREE.SphereGeometry(1, 8, 8);
  const explosionMaterial = new THREE.MeshBasicMaterial({
    color: 0xff5500,
    transparent: true,
    opacity: 0.7,
  });
  const explosion = new THREE.Mesh(explosionGeometry, explosionMaterial);
  explosion.position.copy(position);
  scene.add(explosion);

  // Animar y eliminar la explosión
  let scale = 1;
  const animateExplosion = () => {
    scale += 0.2;
    explosion.scale.set(scale, scale, scale);
    explosionMaterial.opacity -= 0.1;

    if (explosionMaterial.opacity > 0) {
      requestAnimationFrame(animateExplosion);
    } else {
      scene.remove(explosion);
    }
  };
  animateExplosion();
}

function removeProjectile(projectile) {
  const index = projectiles.indexOf(projectile);
  if (index > -1) {
    projectiles.splice(index, 1);
  }

  removeRigidBody(projectile);
  scene.remove(projectile);
}

function removeEnemy(enemy) {
  const index = enemies.indexOf(enemy);
  if (index > -1) {
    enemies.splice(index, 1);
  }

  removeRigidBody(enemy);
  scene.remove(enemy);

  // Efecto visual de eliminación
  createDeathEffect(enemy.position);

  // Verificar victoria
  if (enemies.length === 0) {
    setTimeout(() => completeLevel(), 1000); // Pequeño delay para que se vean los efectos
  }
}

function createDeathEffect(position) {
  // Pequeño efecto visual cuando un enemigo muere
  const particles = new THREE.Group();

  for (let i = 0; i < 8; i++) {
    const particle = new THREE.Mesh(
      new THREE.SphereGeometry(0.08, 4, 4),
      new THREE.MeshBasicMaterial({ color: 0x000000 })
    );
    particle.position.copy(position);

    // Dirección aleatoria
    const direction = new THREE.Vector3(
      Math.random() * 2 - 1,
      Math.random() * 2 - 1,
      Math.random() * 2 - 1
    ).normalize();

    particle.userData.velocity = direction.multiplyScalar(
      1.5 + Math.random() * 1.5
    );
    particles.add(particle);
  }

  scene.add(particles);

  // Animar partículas
  let life = 1.0;
  const animateParticles = () => {
    life -= 0.04;

    particles.children.forEach((particle) => {
      particle.position.add(
        particle.userData.velocity.clone().multiplyScalar(0.08)
      );
      particle.userData.velocity.y -= 0.08; // Gravedad
      particle.material.opacity = life;
    });

    if (life > 0) {
      requestAnimationFrame(animateParticles);
    } else {
      scene.remove(particles);
    }
  };
  animateParticles();
}

function removeBrick(brick) {
  const index = bricks.indexOf(brick);
  if (index > -1) {
    bricks.splice(index, 1);
  }

  removeRigidBody(brick);
  scene.remove(brick);
}

function updateTrajectory() {
  if (!catapult || !trajectoryLine || activeCamera !== catapultCamera) return;

  // ¡USAR LAS MISMAS FUNCIONES QUE SHOOTPROJECTILE!
  const startPos = getProjectileStartPosition(catapult);
  const velocity = getLaunchVelocity(catapult);

  // ¡IMPORTANTE! La física multiplica la velocidad por 1.2 (ver physics.js línea 104)
  // Para que la trayectoria calculada coincida con la real, debemos hacer lo mismo.
  const physicsBoostFactor = 1.2;
  const boostedVelocity = velocity.clone().multiplyScalar(physicsBoostFactor);

  const points = [];
  const gravity = 9.8; // Usar 9.8 para que coincida con la física (physics.js línea 68)
  const timeStep = 0.1;
  const maxTime = 8;

  // Calcular puntos de la trayectoria con la velocidad boosteada
  for (let t = 0; t <= maxTime; t += timeStep) {
    const x = startPos.x + boostedVelocity.x * t;
    const y = startPos.y + boostedVelocity.y * t - 0.5 * gravity * t * t;
    const z = startPos.z + boostedVelocity.z * t;

    // Detener si golpea el suelo
    if (y < 0) {
      const groundTime = t;
      const groundX = startPos.x + boostedVelocity.x * groundTime;
      const groundZ = startPos.z + boostedVelocity.z * groundTime;
      points.push(new THREE.Vector3(groundX, 0, groundZ));
      break;
    }

    points.push(new THREE.Vector3(x, y, z));
  }

  // Actualizar geometría de la línea
  if (points.length > 0) {
    if (trajectoryLine.geometry) {
      trajectoryLine.geometry.dispose();
    }
    trajectoryLine.geometry = new THREE.BufferGeometry().setFromPoints(points);
    trajectoryLine.computeLineDistances();
    trajectoryLine.visible = true;
  } else {
    trajectoryLine.visible = false;
  }
}

function checkCollisionsNow() {
  // Obtener colisiones desde la física
  const collisions = checkCollisions();

  // Procesar colisiones detectadas
  collisions.forEach((collision) => {
    const { enemy, other, type, brickType, isBombCollision } = collision;

    // Ignorar colisiones con objetos decorativos (montañas)
    if (enemy?.userData?.isDecorative || other?.userData?.isDecorative) {
      return;
    }

    // CASO 1: COLISIÓN DE BOMBA (nueva lógica)
    if (isBombCollision) {
      // Verificar que la bomba aún no haya explotado
      if (!other.userData.hasExploded) {
        console.log(
          `💣 BOMBA impactó con ${enemy?.userData?.type || "objeto"}`
        );

        // Marcar que ya impactó
        other.userData.hasExploded = true;

        // Detener movimiento físico
        if (other.userData.physicsBody) {
          other.userData.physicsBody.setLinearVelocity(
            new Ammo.btVector3(0, 0, 0)
          );
          other.userData.physicsBody.setAngularVelocity(
            new Ammo.btVector3(0, 0, 0)
          );
        }

        // Fijar posición si es suelo o está cerca del suelo
        if (enemy.userData.type === "ground" || other.position.y < 0.5) {
          other.position.y = 0.2;
        }

        // Programar explosión en 1 segundo
        setTimeout(() => {
          if (other.parent && other.userData.hasExploded !== false) {
            console.log(`💥 BOMBA explota después de impacto`);
            handleBombExplosion(other);
          }
        }, 1000);

        return; // Salir para no procesar más esta colisión
      }
    }

    // CASO 2: ENEMIGO colisiona con PROYECTIL (NO bomba) - LÓGICA ORIGINAL
    if (
      enemies.includes(enemy) &&
      type === "projectile" &&
      other.userData.projectileType !== "bomb"
    ) {
      if (projectiles.includes(other)) {
        console.log(
          `✅ ENEMIGO GOLPEADO por proyectil ${other.userData.projectileType}`
        );
        removeEnemy(enemy);
        removeProjectile(other);
      } else {
        console.log(`⚠️ Proyectil ya fue procesado`);
      }
      return;
    }

    // CASO 3: ENEMIGO colisiona con LADRILLO MARRÓN (movable) - LÓGICA ORIGINAL
    if (
      enemies.includes(enemy) &&
      type === "brick" &&
      brickType === "movable" &&
      enemy.userData.mass > 0
    ) {
      // Verificar que el ladrillo se esté moviendo con suficiente velocidad
      if (enemy.userData.physicsBody) {
        const velocity = enemy.userData.physicsBody.getLinearVelocity();
        const speed = Math.sqrt(
          velocity.x() ** 2 + velocity.y() ** 2 + velocity.z() ** 2
        );

        // Aumentar el umbral de velocidad para mayor fiabilidad
        if (speed > 2.0) {
          // Cambiado de 1.0 a 2.0
          console.log(
            `✅ ENEMIGO GOLPEADO por ladrillo marrón (velocidad: ${speed.toFixed(
              2
            )})`
          );
          removeEnemy(enemy);

          // Aplicar fuerza de retroceso al ladrillo
          const impulse = new THREE.Vector3(
            Math.random() * 2 - 1,
            2,
            Math.random() * 2 - 1
          )
            .normalize()
            .multiplyScalar(8);

          enemy.userData.physicsBody.applyCentralImpulse(
            new Ammo.btVector3(impulse.x, impulse.y, impulse.z)
          );
        } else {
          console.log(
            `⚠️ Ladrillo marrón velocidad insuficiente (${speed.toFixed(2)})`
          );
        }
      }
      return;
    }

    // NOTA: Si colisiona con ladrillo GRIS (immovable), NO hacemos nada
  });

  // También verificar colisiones con el suelo
  checkGroundCollisions();

  // También verificar colisiones MANUALMENTE para mayor fiabilidad
  checkManualCollisions();

  // Limpiar objetos que hayan caído fuera del mapa
  cleanupOutOfBounds();
}

function checkGroundCollisions() {
  // Verificar si las bombas han tocado el suelo
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const projectile = projectiles[i];

    // Solo verificar bombas que no hayan explotado aún
    if (
      projectile.userData.projectileType === "bomb" &&
      !projectile.userData.hasExploded &&
      projectile.position.y < 0.5 // Más cerca del suelo
    ) {
      console.log(
        `💣 BOMBA tocó el suelo en y=${projectile.position.y.toFixed(2)}`
      );

      // Marcar que impactó
      projectile.userData.hasExploded = true;

      // Fijar la bomba en el suelo
      projectile.position.y = 0.2;

      // Detener movimiento
      if (projectile.userData.physicsBody) {
        projectile.userData.physicsBody.setLinearVelocity(
          new Ammo.btVector3(0, 0, 0)
        );
        projectile.userData.physicsBody.setAngularVelocity(
          new Ammo.btVector3(0, 0, 0)
        );
      }

      // Programar explosión en 1 segundo
      setTimeout(() => {
        if (projectile.parent) {
          console.log(`💥 BOMBA explota en el suelo`);
          handleBombExplosion(projectile);
        }
      }, 1000);
    }
  }
}

function checkManualCollisions() {
  // Verificar colisiones manualmente para mayor fiabilidad
  for (let i = enemies.length - 1; i >= 0; i--) {
    const enemy = enemies[i];

    // Verificar colisiones con proyectiles
    for (let j = projectiles.length - 1; j >= 0; j--) {
      const projectile = projectiles[j];

      // Calcular distancia real
      const distance = enemy.position.distanceTo(projectile.position);
      const enemyRadius = enemy.userData.collisionRadius || 0.5;
      const projectileRadius =
        projectile.userData.collisionRadius ||
        (projectile.userData.projectileType === "bomb" ? 0.4 : 0.35);

      const collisionDistance = enemyRadius + projectileRadius + 0.2; // Margen adicional

      if (distance < collisionDistance) {
        console.log(
          `✅ COLISIÓN MANUAL detectada con proyectil - Distancia: ${distance.toFixed(
            2
          )}`
        );
        removeEnemy(enemy);
        removeProjectile(projectile);
        break; // Salir del bucle de proyectiles para este enemigo
      }
    }

    // Verificar colisiones con ladrillos marrones en movimiento
    for (let j = bricks.length - 1; j >= 0; j--) {
      const brick = bricks[j];

      if (brick.userData.brickType === "movable" && brick.userData.mass > 0) {
        const distance = enemy.position.distanceTo(brick.position);
        const enemyRadius = enemy.userData.collisionRadius || 0.5;
        const brickRadius = brick.userData.collisionRadius || 0.6;

        const collisionDistance = enemyRadius + brickRadius + 0.3; // Margen adicional

        if (distance < collisionDistance && brick.userData.physicsBody) {
          // Verificar velocidad del ladrillo
          const velocity = brick.userData.physicsBody.getLinearVelocity();
          const speed = Math.sqrt(
            velocity.x() ** 2 + velocity.y() ** 2 + velocity.z() ** 2
          );

          if (speed > 2.0) {
            console.log(
              `✅ COLISIÓN MANUAL con ladrillo - Velocidad: ${speed.toFixed(2)}`
            );
            removeEnemy(enemy);

            // Aplicar fuerza de retroceso
            const impulse = new THREE.Vector3(
              Math.random() * 2 - 1,
              2,
              Math.random() * 2 - 1
            )
              .normalize()
              .multiplyScalar(8);

            brick.userData.physicsBody.applyCentralImpulse(
              new Ammo.btVector3(impulse.x, impulse.y, impulse.z)
            );
            break;
          }
        }
      }
    }
  }
}

function cleanupOutOfBounds() {
  // Limpiar proyectiles - límites mucho más grandes por montañas lejanas
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const projectile = projectiles[i];
    if (
      projectile.position.y < -50 ||
      Math.abs(projectile.position.x) > 300 ||
      Math.abs(projectile.position.z) > 300
    ) {
      removeProjectile(projectile);
    }
  }

  // Limpiar enemigos
  for (let i = enemies.length - 1; i >= 0; i--) {
    const enemy = enemies[i];
    if (
      enemy.position.y < -30 ||
      Math.abs(enemy.position.x) > 150 ||
      Math.abs(enemy.position.z) > 150
    ) {
      removeEnemy(enemy);
    }
  }

  // Limpiar ladrillos
  for (let i = bricks.length - 1; i >= 0; i--) {
    const brick = bricks[i];
    if (
      brick.position.y < -40 ||
      Math.abs(brick.position.x) > 180 ||
      Math.abs(brick.position.z) > 180
    ) {
      removeBrick(brick);
    }
  }
}

async function checkGameOver() {
  if (ammo.rock <= 0 && ammo.bomb <= 0 && enemies.length > 0) {
    isGameRunning = false;
    const restart = await showGameOver();
    if (restart) {
      currentLevel = 0;
      startLevel();
    }
  }
}

async function completeLevel() {
  isGameRunning = false;
  const levelTime = (Date.now() - levelStartTime) / 1000;

  const next = await showLevelComplete(currentLevel + 1, ammoUsed, levelTime);
  if (next) {
    currentLevel++;
    if (currentLevel >= levels.length) {
      currentLevel = 0;
    }
    setTimeout(() => startLevel(), 1500);
  }
}

function animate() {
  requestAnimationFrame(animate);
  const deltaTime = clock.getDelta();

  if (isGameRunning) {
    // Actualizar física
    updatePhysics(deltaTime);

    // Verificar colisiones
    checkCollisionsNow();

    // IMPORTANTE: Actualizar cañón basado en input
    if (catapult) {
      updateCatapult(catapult, deltaTime); // Esto ahora manejará las flechas

      // Para debug: muestra valores actuales
      if (catapult.userData) {
        const elevDeg = (
          (catapult.userData.currentElevation * 180) /
          Math.PI
        ).toFixed(1);
        const rotDeg = (
          (catapult.userData.baseRotation * 180) /
          Math.PI
        ).toFixed(1);
        // console.log(`Cañón - Elev: ${elevDeg}°, Rot: ${rotDeg}°, Power: ${catapult.userData.power}`);
      }
    }

    // Actualizar trayectoria
    if (activeCamera === catapultCamera) {
      updateTrajectory();
    }

    // Si quieres una vista más desde el costado derecho:
    // Actualizar cámara de cañón - ¡CAMBIOS AQUÍ!
    // Actualizar cámara de cañón - ¡REVISADO!
    if (activeCamera === catapultCamera && catapult) {
      // ⭐⭐ NUEVO: La cámara debe estar DETRÁS del cañón (en el eje Z negativo)
      // Cuando el cañón mira hacia el centro, la cámara debe estar detrás mirando hacia adelante

      // Offset de la cámara: DETRÁS, ARRIBA y a la DERECHA del cañón
      // Z positivo es adelante del cañón, así que para estar detrás usamos Z negativo
      const offset = new THREE.Vector3(-5, 5, -10); // ⭐ CAMBIADO: de 10 a -10 (detrás)

      // Obtener rotación total del cañón
      const initialRotation = catapult.userData?.initialRotation || 0;
      const baseRotation = catapult.userData?.baseRotation || 0;
      const totalRotation = initialRotation + baseRotation;

      // Rotar el offset según la orientación del cañón
      offset.applyEuler(new THREE.Euler(0, totalRotation, 0));

      // Obtener posición del cañón
      const cannonPosition =
        catapult.userData?.initialPosition || catapult.position.clone();

      // Posicionar cámara DETRÁS del cañón
      catapultCamera.position.copy(cannonPosition).add(offset);

      // Hacer que la cámara mire hacia DONDE APUNTA EL CAÑÓN
      // Calcular punto de mira: un poco adelante en la dirección que apunta el cañón

      // Dirección que apunta el cañón (adelante en Z+ en coordenadas locales)
      const lookDirection = new THREE.Vector3(0, 0, 15); // Más adelante para mejor vista

      // Aplicar rotación del cañón a la dirección de mira
      lookDirection.applyEuler(new THREE.Euler(0, totalRotation, 0));

      // Punto hacia donde mirar
      const lookAtPoint = cannonPosition.clone().add(lookDirection);

      catapultCamera.lookAt(lookAtPoint);
    }

    // Actualizar HUD
    updateHUD(ammo, angle, power, projectileType);
  }

  orbitControls.update();
  renderer.render(scene, activeCamera);
}

// Para debugging
window.game = {
  scene,
  catapult,
  startLevel,
  shootProjectile,
  get ammo() {
    return ammo;
  },
  get enemies() {
    return enemies;
  },
  get projectiles() {
    return projectiles;
  },
  get bricks() {
    return bricks;
  },
  get currentLevel() {
    return currentLevel;
  },
};
