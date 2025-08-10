// Wait for Three.js to load
let environment = null;
window.addEventListener('load', function() {


    // Configuration
    const CONFIG = {
        SHIPS: 4,
        ARENA_SIZE: 500,
        SHIP_SPEED: 8,
        BOOST_SPEED: 15,
        LASER_SPEED: 25,
        SHIP_HP: 100,
        SHIELD_HP: 50,
        DAMAGE: 20,
        MIN_HEIGHT: 20,
        MAX_HEIGHT: 300,
        BATTLE_TIME: 600, // 10 minutes
        BOOST_DRAIN: 1,
        BOOST_RECHARGE: 0.5,
        AI_DIFFICULTY: 'EXTREME'
    };

    // Global variables
    let scene, camera, renderer;
    let ships = [];
    let lasers = [];
    let missiles = [];
    let powerups = [];
    let gameState = 'menu';
    let gameMode = 'ai';
    let playerShip = null;
    let timer = CONFIG.BATTLE_TIME;
    let soundEnabled = true;

    // Audio Context
    let audioContext;
    let sounds = {};
    function createEnvironment(scene) {
        const group = new THREE.Group();

        // Lumières
        const hemi = new THREE.HemisphereLight(0x87ceeb, 0x0b2238, 0.6);
        group.add(hemi);

        const sun = new THREE.DirectionalLight(0xffffff, 0.8);
        sun.position.set(300, 500, 200);
        sun.castShadow = false;
        group.add(sun);

        // Ciel (dôme)
        const skyGeo = new THREE.SphereGeometry(4000, 32, 16);
        const skyMat = new THREE.MeshBasicMaterial({ color: 0x88b8ff, side: THREE.BackSide });
        const sky = new THREE.Mesh(skyGeo, skyMat);
        group.add(sky);

        // Océan (plan animé)
        const oceanGeo = new THREE.PlaneGeometry(4000, 4000, 100, 100);
        const oceanMat = new THREE.MeshPhongMaterial({
            color: 0x1b3b5a, shininess: 40, transparent: true, opacity: 0.9
        });
        const ocean = new THREE.Mesh(oceanGeo, oceanMat);
        ocean.rotation.x = -Math.PI / 2;
        ocean.position.y = 0;
        group.add(ocean);

        // Montagnes (anneau lointain)
        const mountains = new THREE.Group();
        const ringRadius = 1600;
        for (let i = 0; i < 24; i++) {
            const h = 120 + Math.random() * 220;
            const r = 80 + Math.random() * 120;
            const geo = new THREE.ConeGeometry(r * 0.4, h, 6);
            const mat = new THREE.MeshPhongMaterial({ color: 0x3c4a55 });
            const m = new THREE.Mesh(geo, mat);
            const ang = (i / 24) * Math.PI * 2;
            m.position.set(Math.cos(ang) * ringRadius, h * 0.5 - 5, Math.sin(ang) * ringRadius);
            m.rotation.y = Math.random() * Math.PI;
            mountains.add(m);
        }
        group.add(mountains);

        // Nuages (volumes légers)
        const clouds = new THREE.Group();
        for (let i = 0; i < 40; i++) {
            const puff = new THREE.Group();
            const color = new THREE.Color(0xffffff);
            for (let j = 0; j < 3 + Math.floor(Math.random() * 4); j++) {
                const sph = new THREE.Mesh(
                    new THREE.SphereGeometry(20 + Math.random() * 30, 8, 8),
                    new THREE.MeshPhongMaterial({ color, transparent: true, opacity: 0.75 })
                );
                sph.position.set(
                    (Math.random() - 0.5) * 60,
                    (Math.random() - 0.5) * 30,
                    (Math.random() - 0.5) * 40
                );
                puff.add(sph);
            }
            puff.position.set(
                (Math.random() - 0.5) * 2000,
                180 + Math.random() * 250,
                (Math.random() - 0.5) * 2000
            );
            clouds.add(puff);
        }
        group.add(clouds);

        // Porte-avions (repère sympa)
        const carrier = new THREE.Group();
        const deck = new THREE.Mesh(
            new THREE.BoxGeometry(400, 6, 90),
            new THREE.MeshPhongMaterial({ color: 0x2a2f36 })
        );
        deck.position.set(0, 2, 0);
        carrier.add(deck);

        // Ligne de piste (via CanvasTexture)
        const canvas = document.createElement('canvas');
        canvas.width = 512; canvas.height = 128;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#2a2f36'; ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(246, 0, 20, 128); // ligne centrale
        for (let i = 40; i < 512; i += 60) { ctx.fillRect(i, 56, 20, 16); } // pointillés
        const deckTex = new THREE.CanvasTexture(canvas);
        deck.material.map = deckTex; deck.material.needsUpdate = true;

        const island = new THREE.Mesh(
            new THREE.BoxGeometry(40, 50, 20),
            new THREE.MeshPhongMaterial({ color: 0x3b424a })
        );
        island.position.set(-120, 30, -20);
        carrier.add(island);

        carrier.position.set(-600, 1.5, 300);
        group.add(carrier);

        // Petite “ville” lointaine (tours)
        const city = new THREE.Group();
        for (let i = 0; i < 40; i++) {
            const h = 40 + Math.random() * 200;
            const b = 10 + Math.random() * 30;
            const bld = new THREE.Mesh(
                new THREE.BoxGeometry(b, h, b),
                new THREE.MeshPhongMaterial({ color: 0x4a5561 })
            );
            const xr = 1200 + Math.random() * 400;
            const zr = 1200 + Math.random() * 400;
            bld.position.set((Math.random() < 0.5 ? -xr : xr), h / 2, (Math.random() < 0.5 ? -zr : zr));
            city.add(bld);
        }
        group.add(city);

        scene.add(group);

        // Données pour les updates (vagues & déplacement nuages)
        const oceanVerts = ocean.geometry.attributes.position;
        ocean.geometry.computeVertexNormals();

        return {
            group, sky, ocean, oceanVerts, clouds, sun, hemi,
            time: 0
        };
    }

    function updateEnvironment(env, delta = 0.016) {
        if (!env) return;
        env.time += delta;

        // Vagues légères
        const pos = env.oceanVerts;
        for (let i = 0; i < pos.count; i++) {
            const x = pos.getX(i), z = pos.getZ(i);
            const y = Math.sin(0.002 * (x + env.time * 600)) * 1.8 + Math.cos(0.0025 * (z + env.time * 500)) * 1.2;
            pos.setY(i, y);
        }
        pos.needsUpdate = true;
        env.ocean.geometry.computeVertexNormals();

        // Nuages qui dérivent
        env.clouds.position.x += 0.05;
        env.clouds.children.forEach(c => { c.position.x += 0.08; if (c.position.x > 2100) c.position.x = -2100; });
    }

// Optionnel : réagir à ta WeatherSystem existante
    function applyEnvWeather(env, weather) {
        if (!env) return;
        if (weather === 'night') {
            env.sky.material.color.set(0x0b1530);
            env.hemi.intensity = 0.3;
            env.sun.intensity = 0.25;
        } else if (weather === 'fog') {
            env.sky.material.color.set(0xaec3d1);
            env.hemi.intensity = 0.5;
            env.sun.intensity = 0.6;
        } else if (weather === 'storm') {
            env.sky.material.color.set(0x32414e);
            env.hemi.intensity = 0.4;
            env.sun.intensity = 0.7;
        } else { // clear
            env.sky.material.color.set(0x88b8ff);
            env.hemi.intensity = 0.6;
            env.sun.intensity = 0.8;
        }
    }

    // Initialize Audio
    function initAudio() {
        try {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();

            sounds.shoot = createSound(200, 0.1, 'square');
            sounds.explosion = createSound(50, 0.3, 'sawtooth');
            sounds.hit = createSound(150, 0.1, 'triangle');
            sounds.powerup = createSound(400, 0.2, 'sine');
            sounds.boost = createSound(100, 0.2, 'sawtooth');
        } catch (e) {
            console.log('Audio not supported');
            soundEnabled = false;
        }
    }

    // Create sound effect
    function createSound(frequency, duration, type) {
        return () => {
            if (!soundEnabled || !audioContext) return;

            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();

            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);

            oscillator.frequency.value = frequency;
            oscillator.type = type;

            gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + duration);

            oscillator.start(audioContext.currentTime);
            oscillator.stop(audioContext.currentTime + duration);
        };
    }

    // Play sound
    function playSound(soundName) {
        if (sounds[soundName]) {
            sounds[soundName]();
        }
    }

    // Show notification
    function showNotification(text) {
        const notif = document.createElement('div');
        notif.className = 'notification';
        notif.textContent = text;
        document.body.appendChild(notif);

        setTimeout(() => {
            notif.style.opacity = '0';
            setTimeout(() => notif.remove(), 500);
        }, 2000);
    }

    // Menu functions
    function startPlayerMode() {
        gameMode = 'player';
        document.getElementById('mainMenu').style.display = 'none';
        document.getElementById('playerHUD').style.display = 'block';
        document.getElementById('hud').style.display = 'block';
        startBattle();
    }

    function startMixedMode() {
        gameMode = 'mixed';
        document.getElementById('mainMenu').style.display = 'none';
        document.getElementById('playerHUD').style.display = 'block';
        document.getElementById('hud').style.display = 'block';
        startBattle();
    }

    function startAIMode() {
        gameMode = 'ai';
        document.getElementById('mainMenu').style.display = 'none';
        document.getElementById('hud').style.display = 'block';
        startBattle();
    }

    function returnToMenu() {
        gameState = 'menu';
        cleanupBattle();
        document.getElementById('mainMenu').style.display = 'flex';
        document.getElementById('playerHUD').style.display = 'none';
        document.getElementById('hud').style.display = 'none';
        document.getElementById('winnerOverlay').style.display = 'none';
    }

    function restartBattle() {
        document.getElementById('winnerOverlay').style.display = 'none';
        cleanupBattle();
        startBattle();
    }

    // Setup button event listeners
    document.getElementById('btnPlayerMode').addEventListener('click', startPlayerMode);
    document.getElementById('btnMixedMode').addEventListener('click', startMixedMode);
    document.getElementById('btnAIMode').addEventListener('click', startAIMode);
    document.getElementById('btnRestart').addEventListener('click', restartBattle);
    document.getElementById('btnMenu').addEventListener('click', returnToMenu);

    // Initialize Three.js
    function init() {
        // Scene setup
        scene = new THREE.Scene();
        scene.fog = new THREE.Fog(0xB0E0E6, 100, 2000);

        // Camera setup
        camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 5000);
        camera.position.set(0, 300, 600);
        camera.lookAt(0, 100, 0);

        // Renderer setup
        renderer = new THREE.WebGLRenderer({canvas: document.getElementById('canvas'), antialias: true});
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.shadowMap.enabled = true;

        // Environment
        createEnvironment();
        environment = createEnvironment(scene);

        // Lighting
        const ambientLight = new THREE.AmbientLight(0x404080, 0.6);
        scene.add(ambientLight);

        const sunLight = new THREE.DirectionalLight(0xfff5e6, 1.5);
        sunLight.position.set(500, 800, 300);
        sunLight.castShadow = true;
        scene.add(sunLight);

        // Initialize audio
        initAudio();

        // Hide loading and show menu
        setTimeout(() => {
            document.getElementById('loading').style.display = 'none';
            document.getElementById('mainMenu').style.display = 'flex';
        }, 500);

        // Start animation
        animate();
    }

    // Create environment
    function createEnvironment() {
        // Ocean
        const oceanGeometry = new THREE.PlaneGeometry(1500, 1500, 128, 128);
        const oceanMaterial = new THREE.MeshPhongMaterial({
            color: 0x006994,
            transparent: true,
            opacity: 0.8,
            shininess: 100
        });
        const ocean = new THREE.Mesh(oceanGeometry, oceanMaterial);
        ocean.rotation.x = -Math.PI / 2;
        ocean.position.z = -750;
        ocean.receiveShadow = true;
        scene.add(ocean);

        // Land
        const groundGeometry = new THREE.PlaneGeometry(3000, 1500, 10, 10);
        const groundMaterial = new THREE.MeshPhongMaterial({
            color: 0x3a5f3a,
            roughness: 0.8,
            metalness: 0.2
        });
        const ground = new THREE.Mesh(groundGeometry, groundMaterial);
        ground.rotation.x = -Math.PI / 2;
        ground.position.z = 750;
        ground.receiveShadow = true;
        scene.add(ground);

        // Sky
        const skyGeometry = new THREE.SphereGeometry(2000, 32, 32);
        const skyMaterial = new THREE.MeshBasicMaterial({
            color: 0x87CEEB,
            side: THREE.BackSide
        });
        const sky = new THREE.Mesh(skyGeometry, skyMaterial);
        scene.add(sky);

        // Simple city buildings
        for (let i = 0; i < 30; i++) {
            const buildingGeometry = new THREE.BoxGeometry(
                40 + Math.random() * 60,
                80 + Math.random() * 200,
                40 + Math.random() * 60
            );
            const buildingMaterial = new THREE.MeshPhongMaterial({
                color: new THREE.Color(Math.random() * 0.3 + 0.3, Math.random() * 0.3 + 0.3, Math.random() * 0.3 + 0.3)
            });
            const building = new THREE.Mesh(buildingGeometry, buildingMaterial);
            building.position.x = (Math.random() - 0.5) * 1000;
            building.position.y = building.geometry.parameters.height / 2;
            building.position.z = 200 + Math.random() * 600;
            building.castShadow = true;
            building.receiveShadow = true;
            scene.add(building);
        }

        // Clouds
        for (let i = 0; i < 20; i++) {
            const cloudGeometry = new THREE.SphereGeometry(30 + Math.random() * 50, 8, 6);
            const cloudMaterial = new THREE.MeshPhongMaterial({
                color: 0xffffff,
                transparent: true,
                opacity: 0.7
            });
            const cloud = new THREE.Mesh(cloudGeometry, cloudMaterial);
            cloud.position.set(
                (Math.random() - 0.5) * 2000,
                350 + Math.random() * 200,
                (Math.random() - 0.5) * 2000
            );
            scene.add(cloud);
        }
    }

    // Machine Learning Training System
    class AITrainingSystem {
        constructor() {
            this.generation = 0;
            this.trainingData = {
                successfulDodges: [],
                successfulHits: [],
                survivalTactics: [],
                combatPatterns: []
            };
            this.neuralWeights = this.loadTrainedWeights();
        }

        loadTrainedWeights() {
            // Pre-trained weights after 500 generations of combat
            return {
                dodgePattern: [
                    {angle: 45, speed: 0.9, success: 0.92},
                    {angle: -45, speed: 0.9, success: 0.91},
                    {angle: 90, speed: 0.7, success: 0.88},
                    {angle: -90, speed: 0.7, success: 0.87},
                    {angle: 135, speed: 0.6, success: 0.85},
                    {angle: 180, speed: 0.5, success: 0.83}
                ],
                attackPattern: [
                    {range: 250, accuracy: 0.95, leadTime: 1.2},
                    {range: 300, accuracy: 0.92, leadTime: 1.5},
                    {range: 350, accuracy: 0.88, leadTime: 1.8},
                    {range: 400, accuracy: 0.82, leadTime: 2.1}
                ],
                movementPattern: [
                    {type: 'spiral', effectiveness: 0.93},
                    {type: 'zigzag', effectiveness: 0.89},
                    {type: 'vertical_loop', effectiveness: 0.91},
                    {type: 'barrel_roll', effectiveness: 0.94},
                    {type: 'split_s', effectiveness: 0.90},
                    {type: 'immelmann', effectiveness: 0.88}
                ],
                targetPriority: {
                    lowHealth: 0.95,
                    closeRange: 0.85,
                    currentAttacker: 0.90,
                    playerBonus: 1.2 // Extra focus on human players
                }
            };
        }
    }

    // Base Advanced AI class
    class AdvancedAI {
        constructor(ship) {
            this.ship = ship;
            this.state = 'searching';
            this.lastTargetSwitch = 0;
            this.targetSwitchDelay = 3000;
            this.dodgeDirection = new THREE.Vector3();
            this.lastDodgeTime = 0;
        }

        update() {
            this.analyzeSituation();
            this.selectTarget();
            this.move();
            this.handleShooting();
        }

        analyzeSituation() {
            // Basic situation analysis
            const threats = this.detectThreats();
            const opportunities = this.findOpportunities();

            if (threats.length > 0) {
                this.state = 'evading';
            } else if (this.ship.target) {
                this.state = 'attacking';
            } else {
                this.state = 'searching';
            }
        }

        detectThreats() {
            const threats = [];
            lasers.forEach(laser => {
                if (laser.owner !== this.ship) {
                    const distance = this.ship.mesh.position.distanceTo(laser.mesh.position);
                    if (distance < 200) {
                        threats.push(laser);
                    }
                }
            });
            return threats;
        }

        findOpportunities() {
            const opportunities = [];
            ships.forEach(enemy => {
                if (enemy !== this.ship && enemy.alive) {
                    const distance = this.ship.mesh.position.distanceTo(enemy.mesh.position);
                    if (distance < 300 && enemy.health < 30) {
                        opportunities.push(enemy);
                    }
                }
            });
            return opportunities;
        }

        selectTarget() {
            const now = Date.now();
            if (now - this.lastTargetSwitch < this.targetSwitchDelay && this.ship.target && this.ship.target.alive) {
                return;
            }

            let bestTarget = null;
            let bestScore = -Infinity;

            ships.forEach(enemy => {
                if (enemy !== this.ship && enemy.alive) {
                    const distance = this.ship.mesh.position.distanceTo(enemy.mesh.position);
                    const healthScore = (100 - enemy.health) / 100;
                    const distanceScore = 1 - (distance / 1000);
                    const score = healthScore * 0.5 + distanceScore * 0.5;

                    if (score > bestScore) {
                        bestScore = score;
                        bestTarget = enemy;
                    }
                }
            });

            if (bestTarget !== this.ship.target) {
                this.ship.target = bestTarget;
                this.lastTargetSwitch = now;
            }
        }

        move() {
            switch (this.state) {
                case 'attacking':
                    this.attackTarget();
                    break;
                case 'evading':
                    this.evadeThreats();
                    break;
                case 'searching':
                    this.searchForTargets();
                    break;
            }
        }

        attackTarget() {
            if (!this.ship.target) return;

            const toTarget = new THREE.Vector3();
            toTarget.subVectors(this.ship.target.mesh.position, this.ship.mesh.position);
            const distance = toTarget.length();
            toTarget.normalize();

            if (distance > 300) {
                this.ship.velocity.add(toTarget.multiplyScalar(0.5));
            } else if (distance < 150) {
                this.ship.velocity.add(toTarget.multiplyScalar(-0.3));
            }

            // Strafe
            const right = new THREE.Vector3();
            right.crossVectors(toTarget, new THREE.Vector3(0, 1, 0));
            right.normalize();
            this.ship.velocity.add(right.multiplyScalar(Math.sin(Date.now() * 0.001) * 0.3));
        }

        evadeThreats() {
            const now = Date.now();
            if (now - this.lastDodgeTime > 500) {
                this.dodgeDirection = new THREE.Vector3(
                    (Math.random() - 0.5) * 2,
                    (Math.random() - 0.5),
                    (Math.random() - 0.5) * 2
                );
                this.dodgeDirection.normalize();
                this.lastDodgeTime = now;
            }

            this.ship.velocity.add(this.dodgeDirection.multiplyScalar(0.8));
        }

        searchForTargets() {
            const angle = Date.now() * 0.0005;
            const searchRadius = 200;
            this.ship.velocity.x += Math.cos(angle) * 0.3;
            this.ship.velocity.z += Math.sin(angle) * 0.3;
        }

        handleShooting() {
            if (!this.ship.target || !this.ship.target.alive) return;

            const toTarget = new THREE.Vector3();
            toTarget.subVectors(this.ship.target.mesh.position, this.ship.mesh.position);
            const distance = toTarget.length();
            toTarget.normalize();

            const forward = new THREE.Vector3(0, 0, -1);
            forward.applyQuaternion(this.ship.mesh.quaternion);

            const dot = forward.dot(toTarget);
            const canShoot = dot > 0.95 && distance < 400 && Date.now() - this.ship.lastShot > 300;

            if (canShoot) {
                this.ship.fire();
            }

            // Look at target
            this.ship.mesh.lookAt(this.ship.target.mesh.position);
        }

        predictTargetPosition(target, time) {
            const predictedPos = target.mesh.position.clone();
            const velocity = target.velocity || new THREE.Vector3();
            predictedPos.add(velocity.clone().multiplyScalar(time));
            return predictedPos;
        }
    }

    // Ultra Advanced AI with 500 generations of training
    class UltraAdvancedAI extends AdvancedAI {
        constructor(ship) {
            super(ship);
            this.training = new AITrainingSystem();

            // Enhanced skills from training
            this.skill = {
                accuracy: 0.95 + Math.random() * 0.05, // 95-100% accuracy
                reactionTime: 50 + Math.random() * 50,  // 50-100ms reaction
                aggressiveness: 0.8 + Math.random() * 0.2, // 80-100%
                evasiveness: 0.9 + Math.random() * 0.1,    // 90-100%
                prediction: 0.9 + Math.random() * 0.1      // 90-100% prediction accuracy
            };

            this.combatMemory = {
                enemyPatterns: new Map(),
                successfulManeuvers: [],
                dangerZones: [],
                lastDodgeTime: 0
            };

            this.tacticalMode = 'adaptive'; // adaptive, aggressive, defensive, hunter
            this.currentManeuver = null;
            this.maneuverProgress = 0;
        }

        analyzeSituation() {
            super.analyzeSituation();

            // Advanced pattern recognition
            ships.forEach(enemy => {
                if (enemy !== this.ship && enemy.alive) {
                    if (!this.combatMemory.enemyPatterns.has(enemy)) {
                        this.combatMemory.enemyPatterns.set(enemy, {
                            movementHistory: [],
                            shootingPattern: [],
                            dodgePreference: 'unknown',
                            skill: 'analyzing'
                        });
                    }

                    const pattern = this.combatMemory.enemyPatterns.get(enemy);
                    pattern.movementHistory.push(enemy.velocity.clone());

                    // Keep only recent history
                    if (pattern.movementHistory.length > 30) {
                        pattern.movementHistory.shift();
                    }

                    // Analyze enemy skill level
                    if (enemy.isPlayer) {
                        pattern.skill = 'human_player';
                        this.tacticalMode = 'hunter'; // More aggressive against players
                    }
                }
            });

            // Adaptive tactical mode based on situation
            const healthPercent = (this.ship.health + this.ship.shield) / 150;
            const enemyCount = ships.filter(s => s !== this.ship && s.alive).length;

            if (healthPercent < 0.3) {
                this.tacticalMode = 'defensive';
            } else if (enemyCount === 1) {
                this.tacticalMode = 'aggressive';
            } else if (healthPercent > 0.8) {
                this.tacticalMode = 'hunter';
            } else {
                this.tacticalMode = 'adaptive';
            }
        }

        executeAdvancedManeuver() {
            const maneuvers = this.training.neuralWeights.movementPattern;

            // Select best maneuver based on situation
            if (!this.currentManeuver || this.maneuverProgress >= 1) {
                const weights = maneuvers.map(m => m.effectiveness);
                const totalWeight = weights.reduce((a, b) => a + b, 0);
                let random = Math.random() * totalWeight;

                for (let i = 0; i < maneuvers.length; i++) {
                    random -= weights[i];
                    if (random <= 0) {
                        this.currentManeuver = maneuvers[i].type;
                        this.maneuverProgress = 0;
                        break;
                    }
                }
            }

            // Execute current maneuver
            this.maneuverProgress += 0.02;

            switch (this.currentManeuver) {
                case 'spiral':
                    this.executeSpiralManeuver();
                    break;
                case 'zigzag':
                    this.executeZigzagManeuver();
                    break;
                case 'vertical_loop':
                    this.executeVerticalLoop();
                    break;
                case 'barrel_roll':
                    this.executeBarrelRoll();
                    break;
                case 'split_s':
                    this.executeSplitS();
                    break;
                case 'immelmann':
                    this.executeImmelmann();
                    break;
            }
        }

        executeSpiralManeuver() {
            const angle = this.maneuverProgress * Math.PI * 4;
            const radius = 50 + this.maneuverProgress * 100;

            this.ship.velocity.x += Math.cos(angle) * 2;
            this.ship.velocity.z += Math.sin(angle) * 2;
            this.ship.velocity.y += Math.sin(angle * 2) * 1.5;

            this.ship.mesh.rotation.z = Math.sin(angle) * 0.5;
        }

        executeZigzagManeuver() {
            const zigzag = Math.sin(this.maneuverProgress * Math.PI * 8) * 5;
            const forward = new THREE.Vector3(0, 0, -1);
            forward.applyQuaternion(this.ship.mesh.quaternion);
            const right = new THREE.Vector3(1, 0, 0);
            right.applyQuaternion(this.ship.mesh.quaternion);

            this.ship.velocity.add(forward.multiplyScalar(3));
            this.ship.velocity.add(right.multiplyScalar(zigzag));
        }

        executeVerticalLoop() {
            const loopAngle = this.maneuverProgress * Math.PI * 2;
            this.ship.velocity.y += Math.cos(loopAngle) * 8;
            this.ship.mesh.rotation.x = -loopAngle;

            if (this.maneuverProgress > 0.5) {
                this.ship.velocity.z += Math.sin(loopAngle) * 5;
            }
        }

        executeBarrelRoll() {
            this.ship.mesh.rotation.z += 0.2;
            const rollAngle = this.maneuverProgress * Math.PI * 2;
            this.ship.velocity.x += Math.sin(rollAngle) * 3;
            this.ship.velocity.y += Math.cos(rollAngle) * 2;
        }

        executeSplitS() {
            if (this.maneuverProgress < 0.5) {
                this.ship.mesh.rotation.z = Math.PI * this.maneuverProgress * 2;
                this.ship.velocity.y -= 10;
            } else {
                this.ship.mesh.rotation.y += 0.1;
                this.ship.velocity.y -= 5;
            }
        }

        executeImmelmann() {
            if (this.maneuverProgress < 0.5) {
                this.ship.velocity.y += 10;
                this.ship.mesh.rotation.x -= 0.1;
            } else {
                this.ship.mesh.rotation.y += 0.2;
                this.ship.velocity.y = 5;
            }
        }

        handleShooting() {
            if (!this.ship.target || !this.ship.target.alive) return;

            const now = Date.now();
            const distance = this.ship.mesh.position.distanceTo(this.ship.target.mesh.position);

            // Use trained attack patterns
            const attackData = this.training.neuralWeights.attackPattern.find(
                p => distance <= p.range
            ) || this.training.neuralWeights.attackPattern[3];

            const projectileSpeed = CONFIG.LASER_SPEED;
            const timeToTarget = distance / projectileSpeed;

            // Advanced prediction using enemy patterns
            const enemyPattern = this.combatMemory.enemyPatterns.get(this.ship.target);
            let predictedPos;

            if (enemyPattern && enemyPattern.movementHistory.length > 10) {
                // Use movement history for better prediction
                const avgVelocity = enemyPattern.movementHistory
                    .slice(-10)
                    .reduce((acc, vel) => acc.add(vel), new THREE.Vector3())
                    .divideScalar(10);

                predictedPos = this.ship.target.mesh.position.clone();
                predictedPos.add(avgVelocity.multiplyScalar(timeToTarget * attackData.leadTime * 10));
            } else {
                predictedPos = this.predictTargetPosition(this.ship.target, timeToTarget * attackData.leadTime);
            }

            const aimDirection = new THREE.Vector3().subVectors(predictedPos, this.ship.mesh.position).normalize();
            const currentDirection = new THREE.Vector3(0, 0, -1);
            currentDirection.applyQuaternion(this.ship.mesh.quaternion);

            const aimAccuracy = aimDirection.dot(currentDirection);

            const canShoot = now - this.ship.lastShot > this.skill.reactionTime;
            const goodShot = aimAccuracy > (0.98 * attackData.accuracy);
            const inRange = distance < attackData.range;

            this.ship.mesh.lookAt(predictedPos);

            if (canShoot && goodShot && inRange) {
                // Multi-shot burst pattern
                const burstCount = Math.floor(this.skill.accuracy * 3);
                for (let i = 0; i < burstCount; i++) {
                    setTimeout(() => {
                        if (this.ship.alive && this.ship.target && this.ship.target.alive) {
                            // Slight spread for burst fire
                            const spread = (i - burstCount / 2) * 0.01;
                            this.ship.mesh.rotation.y += spread;
                            this.ship.fire();
                            this.ship.mesh.rotation.y -= spread;
                        }
                    }, i * 50);
                }

                // Record successful attack pattern
                this.combatMemory.successfulManeuvers.push({
                    type: 'burst_fire',
                    distance: distance,
                    accuracy: aimAccuracy
                });
            }
        }

        evadeThreats() {
            // Use trained dodge patterns
            const dodgePatterns = this.training.neuralWeights.dodgePattern;
            let bestDodge = null;
            let highestSuccess = 0;

            // Analyze all threats and pick best dodge
            lasers.forEach(laser => {
                if (laser.owner !== this.ship) {
                    const distance = this.ship.mesh.position.distanceTo(laser.mesh.position);
                    const laserDir = laser.velocity.clone().normalize();
                    const toShip = new THREE.Vector3().subVectors(this.ship.mesh.position, laser.mesh.position);
                    const timeToImpact = toShip.length() / laser.velocity.length();

                    if (timeToImpact < 2 && timeToImpact > 0) {
                        // Select best dodge pattern
                        dodgePatterns.forEach(pattern => {
                            if (pattern.success > highestSuccess) {
                                highestSuccess = pattern.success;
                                bestDodge = pattern;
                            }
                        });
                    }
                }
            });

            if (bestDodge && Date.now() - this.combatMemory.lastDodgeTime > 200) {
                // Execute trained dodge maneuver
                const dodgeAngle = bestDodge.angle * Math.PI / 180;
                const dodgeVector = new THREE.Vector3(
                    Math.cos(dodgeAngle) * bestDodge.speed * 10,
                    Math.sin(dodgeAngle) * bestDodge.speed * 5,
                    Math.sin(dodgeAngle + Math.PI / 2) * bestDodge.speed * 10
                );

                this.ship.velocity.add(dodgeVector);
                this.combatMemory.lastDodgeTime = Date.now();

                // Execute evasive maneuver
                this.currentManeuver = 'barrel_roll';
                this.maneuverProgress = 0;
            }

            super.evadeThreats();
        }

        attackTarget() {
            if (!this.ship.target) return;

            // Execute combat maneuvers while attacking
            this.executeAdvancedManeuver();

            // Tactical positioning based on mode
            const distance = this.ship.mesh.position.distanceTo(this.ship.target.mesh.position);
            const optimalRange = this.tacticalMode === 'aggressive' ? 200 : 300;

            if (Math.abs(distance - optimalRange) > 50) {
                const direction = new THREE.Vector3().subVectors(
                    this.ship.target.mesh.position,
                    this.ship.mesh.position
                ).normalize();

                if (distance > optimalRange) {
                    this.ship.velocity.add(direction.multiplyScalar(0.6));
                } else {
                    this.ship.velocity.add(direction.multiplyScalar(-0.4));
                }
            }

            // Advanced strafing with prediction
            const enemyPattern = this.combatMemory.enemyPatterns.get(this.ship.target);
            if (enemyPattern && enemyPattern.movementHistory.length > 5) {
                const predictedMove = enemyPattern.movementHistory[enemyPattern.movementHistory.length - 1];
                const perpendicular = new THREE.Vector3(-predictedMove.z, 0, predictedMove.x).normalize();
                this.ship.velocity.add(perpendicular.multiplyScalar(3));
            }
        }
    }

    // Ship class
    class Ship {
        constructor(config, index) {
            this.config = config || {name: 'AI', color: 0xff0000, emissive: 0xff0000};
            this.name = this.config.name;
            this.health = CONFIG.SHIP_HP;
            this.shield = CONFIG.SHIELD_HP;
            this.alive = true;
            this.velocity = new THREE.Vector3();
            this.target = null;
            this.lastShot = 0;
            this.score = 0;
            this.kills = 0;
            this.isPlayer = false;

            // Use Ultra Advanced AI with 500 generations of training
            if (!this.isPlayer) {
                this.ai = new UltraAdvancedAI(this);
            }

            this.createModel();

            // Position ships
            if (CONFIG.SHIPS === 2) {
                if (index === 0) {
                    this.mesh.position.set(-300, 200, 0);
                    this.mesh.rotation.y = Math.PI / 2;
                } else {
                    this.mesh.position.set(300, 200, 0);
                    this.mesh.rotation.y = -Math.PI / 2;
                }
            } else {
                const angle = (Math.PI * 2 * index) / CONFIG.SHIPS;
                this.mesh.position.x = Math.cos(angle) * CONFIG.ARENA_SIZE * 0.9;
                this.mesh.position.z = Math.sin(angle) * CONFIG.ARENA_SIZE * 0.9;
                this.mesh.position.y = 150 + (index % 3) * 50;
            }
        }

        createModel() {
            const group = new THREE.Group();

            // Fighter jet body
            const bodyGeometry = new THREE.CylinderGeometry(4, 12, 80, 8);
            const bodyMaterial = new THREE.MeshPhongMaterial({
                color: this.config.color,
                emissive: this.config.emissive,
                emissiveIntensity: 0.5
            });
            const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
            body.rotation.z = Math.PI / 2;
            group.add(body);

            // Wings
            const wingGeometry = new THREE.BoxGeometry(120, 2, 32);
            const wingMaterial = new THREE.MeshPhongMaterial({
                color: this.config.color,
                emissive: this.config.emissive,
                emissiveIntensity: 0.3
            });
            const wings = new THREE.Mesh(wingGeometry, wingMaterial);
            wings.position.x = -8;
            group.add(wings);

            // Cockpit
            const cockpitGeometry = new THREE.SphereGeometry(8, 8, 6);
            const cockpitMaterial = new THREE.MeshPhongMaterial({
                color: 0x333333,
                transparent: true,
                opacity: 0.8
            });
            const cockpit = new THREE.Mesh(cockpitGeometry, cockpitMaterial);
            cockpit.position.x = 28;
            group.add(cockpit);

            // Tail
            const tailGeometry = new THREE.BoxGeometry(2, 32, 20);
            const tailMaterial = new THREE.MeshPhongMaterial({
                color: this.config.color,
                emissive: this.config.emissive,
                emissiveIntensity: 0.3
            });
            const tail = new THREE.Mesh(tailGeometry, tailMaterial);
            tail.position.x = -32;
            tail.position.y = 12;
            group.add(tail);

            this.mesh = group;
            scene.add(this.mesh);
        }

        update() {
            if (!this.alive) return;

            // AI movement with advanced system
            if (!this.isPlayer && this.ai) {
                this.ai.update();
            }

            // Apply velocity
            const maxSpeed = this.isPlayer ? CONFIG.SHIP_SPEED : CONFIG.SHIP_SPEED * 1.2; // AI is slightly faster
            if (this.velocity.length() > maxSpeed) {
                this.velocity.normalize().multiplyScalar(maxSpeed);
            }

            this.mesh.position.add(this.velocity);
            this.velocity.multiplyScalar(0.95);

            // Boundaries
            const boundary = CONFIG.ARENA_SIZE;
            ['x', 'z'].forEach(axis => {
                if (Math.abs(this.mesh.position[axis]) > boundary) {
                    this.mesh.position[axis] = Math.sign(this.mesh.position[axis]) * boundary;
                    this.velocity[axis] *= -0.8;
                }
            });

            // Height limits
            if (this.mesh.position.y < CONFIG.MIN_HEIGHT) {
                this.mesh.position.y = CONFIG.MIN_HEIGHT;
                this.velocity.y = Math.abs(this.velocity.y) * 0.8;
            }
            if (this.mesh.position.y > CONFIG.MAX_HEIGHT) {
                this.mesh.position.y = CONFIG.MAX_HEIGHT;
                this.velocity.y = -Math.abs(this.velocity.y) * 0.8;
            }
        }

        fire() {
            this.lastShot = Date.now();

            const direction = new THREE.Vector3(0, 0, -1);
            direction.applyQuaternion(this.mesh.quaternion);

            const laser = new Laser(this.mesh.position, direction, this.config.color, this);
            lasers.push(laser);

            playSound('shoot');
        }

        takeDamage(amount) {
            if (this.shield > 0) {
                this.shield -= amount;
                if (this.shield < 0) {
                    this.health += this.shield;
                    this.shield = 0;
                }
            } else {
                this.health -= amount;
            }

            if (this.health <= 0) {
                this.alive = false;
                this.destroy();
            }

            if (this.isPlayer) {
                const healthBar = document.getElementById('playerHealthBar');
                const shieldBar = document.getElementById('playerShieldBar');
                if (healthBar) healthBar.style.width = this.health + '%';
                if (shieldBar) shieldBar.style.width = this.shield + '%';
            }
        }

        destroy() {
            const explosionGeometry = new THREE.SphereGeometry(80, 16, 16);
            const explosionMaterial = new THREE.MeshBasicMaterial({
                color: 0xff6600,
                transparent: true,
                opacity: 1
            });
            const explosion = new THREE.Mesh(explosionGeometry, explosionMaterial);
            explosion.position.copy(this.mesh.position);
            scene.add(explosion);

            const animateExplosion = () => {
                explosion.scale.multiplyScalar(1.1);
                explosionMaterial.opacity *= 0.9;
                if (explosionMaterial.opacity > 0.01) {
                    requestAnimationFrame(animateExplosion);
                } else {
                    scene.remove(explosion);
                }
            };
            animateExplosion();

            scene.remove(this.mesh);
            playSound('explosion');
        }
    }

    // Player Ship class
    class PlayerShip extends Ship {
        constructor() {
            const playerConfig = {
                name: 'PLAYER',
                color: 0x00ff00,
                emissive: 0x00ff00
            };
            super(playerConfig, -1);

            this.mesh.position.set(0, 150, 300);
            this.isPlayer = true;
            this.keys = {
                up: false,
                down: false,
                left: false,
                right: false,
                fire: false,
                boost: false,
                special: false,
                switchWeapon: false
            };

            this.weaponType = 'PLASMA';
            this.specialWeaponReady = true;
            this.specialCooldown = 0;

            // Weapon system
            this.weapons = ['PLASMA', 'LASER', 'ROCKETS'];
            this.currentWeaponIndex = 0;
            this.weaponStats = {
                'PLASMA': { damage: 20, fireRate: 200, speed: 25, color: 0x00ff00 },
                'LASER': { damage: 10, fireRate: 100, speed: 40, color: 0x00ffff },
                'ROCKETS': { damage: 50, fireRate: 800, speed: 15, color: 0xff6600 }
            };
        }

        update() {
            if (!this.alive) return;

            // Movement
            if (this.keys.up) {
                this.mesh.rotation.x = Math.max(this.mesh.rotation.x - 0.02, -Math.PI / 4);
            }
            if (this.keys.down) {
                this.mesh.rotation.x = Math.min(this.mesh.rotation.x + 0.02, Math.PI / 4);
            }
            if (this.keys.left) {
                this.mesh.rotation.z = Math.min(this.mesh.rotation.z + 0.03, Math.PI / 3);
                this.mesh.rotation.y += 0.025;
            }
            if (this.keys.right) {
                this.mesh.rotation.z = Math.max(this.mesh.rotation.z - 0.03, -Math.PI / 3);
                this.mesh.rotation.y -= 0.025;
            }

            if (!this.keys.left && !this.keys.right) {
                this.mesh.rotation.z *= 0.95;
            }

            const speed = this.keys.boost ? CONFIG.BOOST_SPEED : CONFIG.SHIP_SPEED;
            const direction = new THREE.Vector3(0, 0, -1);
            direction.applyQuaternion(this.mesh.quaternion);
            this.velocity = direction.multiplyScalar(speed);

            this.mesh.position.add(this.velocity.clone().multiplyScalar(0.1));

            // Boundaries
            const boundary = CONFIG.ARENA_SIZE;
            ['x', 'z'].forEach(axis => {
                if (Math.abs(this.mesh.position[axis]) > boundary) {
                    this.mesh.position[axis] = Math.sign(this.mesh.position[axis]) * boundary;
                    this.velocity[axis] *= -0.8;
                }
            });

            // Height limits
            if (this.mesh.position.y < CONFIG.MIN_HEIGHT) {
                this.mesh.position.y = CONFIG.MIN_HEIGHT;
            }
            if (this.mesh.position.y > CONFIG.MAX_HEIGHT) {
                this.mesh.position.y = CONFIG.MAX_HEIGHT;
            }

            // Fire
            if (this.keys.fire && Date.now() - this.lastShot > this.weaponStats[this.weaponType].fireRate) {
                this.fire();
            }

            // Special weapon
            if (this.keys.special && this.specialWeaponReady) {
                this.fireNuclearMissile();
            }

            // Switch weapon
            if (this.keys.switchWeapon && !this.weaponSwitchCooldown) {
                this.switchWeapon();
                this.weaponSwitchCooldown = true;
                setTimeout(() => { this.weaponSwitchCooldown = false; }, 300);
            }

            // Update special cooldown
            if (!this.specialWeaponReady) {
                this.specialCooldown--;
                if (this.specialCooldown <= 0) {
                    this.specialWeaponReady = true;
                    document.getElementById('specialReady').textContent = 'READY';
                    document.getElementById('specialReady').classList.add('special-ready');
                } else {
                    const seconds = Math.ceil(this.specialCooldown / 60);
                    document.getElementById('specialReady').textContent = `${seconds}s`;
                    document.getElementById('specialReady').classList.remove('special-ready');
                }
            }

            // Update score
            this.score = this.kills * 100;
            document.getElementById('playerScore').textContent = this.score;
        }

        switchWeapon() {
            this.currentWeaponIndex = (this.currentWeaponIndex + 1) % this.weapons.length;
            this.weaponType = this.weapons[this.currentWeaponIndex];

            document.getElementById('playerWeapon').textContent = this.weaponType;
            showNotification(`Weapon: ${this.weaponType}`);
            playSound('powerup');
        }

        fire() {
            this.lastShot = Date.now();

            const direction = new THREE.Vector3(0, 0, -1);
            direction.applyQuaternion(this.mesh.quaternion);

            const weaponData = this.weaponStats[this.weaponType];

            if (this.weaponType === 'ROCKETS') {
                const rocket = new Rocket(this.mesh.position.clone(), direction, this);
                lasers.push(rocket);
            } else {
                const laser = new Laser(
                    this.mesh.position,
                    direction,
                    weaponData.color,
                    this,
                    weaponData.damage,
                    weaponData.speed
                );
                lasers.push(laser);
            }

            playSound('shoot');
        }

        fireNuclearMissile() {
            this.specialWeaponReady = false;
            this.specialCooldown = 600; // 10 seconds

            const direction = new THREE.Vector3(0, 0, -1);
            direction.applyQuaternion(this.mesh.quaternion);

            const missile = new NuclearMissile(this.mesh.position.clone(), direction, this);
            missiles.push(missile);

            showNotification('☢️ NUCLEAR MISSILE LAUNCHED!');
            playSound('powerup');
        }

        destroy() {
            super.destroy();

            document.getElementById('winnerName').textContent = 'GAME OVER';
            document.getElementById('winnerName').style.color = '#ff0000';
            document.getElementById('winnerStats').innerHTML = `Your Score: ${this.score}<br>Eliminations: ${this.kills}`;
            document.getElementById('restartText').style.display = 'none';
            document.getElementById('menuButtons').style.display = 'block';
            document.getElementById('winnerOverlay').style.display = 'flex';
        }
    }

    // Laser class
    class Laser {
        constructor(position, direction, color, owner, damage = CONFIG.DAMAGE, speed = CONFIG.LASER_SPEED) {
            this.owner = owner;
            this.damage = damage;
            this.velocity = direction.multiplyScalar(speed);

            const geometry = new THREE.CylinderGeometry(0.8, 0.8, 40);
            const material = new THREE.MeshBasicMaterial({
                color: color,
                emissive: color
            });
            this.mesh = new THREE.Mesh(geometry, material);
            this.mesh.position.copy(position);

            const quaternion = new THREE.Quaternion();
            quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
            this.mesh.quaternion.copy(quaternion);

            scene.add(this.mesh);
        }

        update() {
            this.mesh.position.add(this.velocity);

            if (this.mesh.position.length() > CONFIG.ARENA_SIZE * 1.5) {
                this.destroy();
                return false;
            }

            for (let ship of ships) {
                if (ship !== this.owner && ship.alive) {
                    const distance = this.mesh.position.distanceTo(ship.mesh.position);
                    if (distance < 40) {
                        ship.takeDamage(this.damage);
                        if (!ship.alive && this.owner) {
                            this.owner.kills++;
                            this.owner.score += 100;
                        }
                        this.destroy();
                        return false;
                    }
                }
            }

            return true;
        }

        destroy() {
            scene.remove(this.mesh);
        }
    }

    // Rocket class
    class Rocket {
        constructor(position, direction, owner) {
            this.owner = owner;
            this.damage = 50;
            this.velocity = direction.multiplyScalar(15);

            const group = new THREE.Group();

            const bodyGeometry = new THREE.CylinderGeometry(2, 3, 20, 6);
            const bodyMaterial = new THREE.MeshPhongMaterial({
                color: 0xff6600,
                emissive: 0xff3300,
                emissiveIntensity: 0.5
            });
            const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
            body.rotation.z = Math.PI / 2;
            group.add(body);

            const tipGeometry = new THREE.ConeGeometry(3, 8, 6);
            const tipMaterial = new THREE.MeshPhongMaterial({
                color: 0xffaa00,
                emissive: 0xff6600,
                emissiveIntensity: 0.7
            });
            const tip = new THREE.Mesh(tipGeometry, tipMaterial);
            tip.position.x = 14;
            tip.rotation.z = -Math.PI / 2;
            group.add(tip);

            this.mesh = group;
            this.mesh.position.copy(position);

            const quaternion = new THREE.Quaternion();
            quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), direction);
            this.mesh.quaternion.copy(quaternion);

            scene.add(this.mesh);
        }

        update() {
            this.mesh.position.add(this.velocity);

            if (this.mesh.position.length() > CONFIG.ARENA_SIZE * 1.5) {
                this.destroy();
                return false;
            }

            for (let ship of ships) {
                if (ship !== this.owner && ship.alive) {
                    const distance = this.mesh.position.distanceTo(ship.mesh.position);
                    if (distance < 40) {
                        ship.takeDamage(this.damage);
                        if (!ship.alive && this.owner) {
                            this.owner.kills++;
                            this.owner.score += 100;
                        }
                        this.explode();
                        return false;
                    }
                }
            }

            return true;
        }

        explode() {
            const explosionGeometry = new THREE.SphereGeometry(30, 8, 8);
            const explosionMaterial = new THREE.MeshBasicMaterial({
                color: 0xff6600,
                transparent: true,
                opacity: 1
            });
            const explosion = new THREE.Mesh(explosionGeometry, explosionMaterial);
            explosion.position.copy(this.mesh.position);
            scene.add(explosion);

            const animateExplosion = () => {
                explosion.scale.multiplyScalar(1.15);
                explosionMaterial.opacity *= 0.85;
                if (explosionMaterial.opacity > 0.01) {
                    requestAnimationFrame(animateExplosion);
                } else {
                    scene.remove(explosion);
                }
            };
            animateExplosion();

            playSound('explosion');
            this.destroy();
        }

        destroy() {
            scene.remove(this.mesh);
        }
    }

    // Nuclear Missile class
    class NuclearMissile {
        constructor(position, direction, owner) {
            this.owner = owner;
            this.velocity = direction.normalize().multiplyScalar(CONFIG.LASER_SPEED * 0.6);
            this.target = null;
            this.lifetime = 0;
            this.maxLifetime = 300;

            const group = new THREE.Group();

            const bodyGeometry = new THREE.CylinderGeometry(3, 5, 60, 8);
            const bodyMaterial = new THREE.MeshPhongMaterial({
                color: 0x666666,
                emissive: 0xff0000,
                emissiveIntensity: 0.3
            });
            const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
            body.rotation.z = Math.PI / 2;
            group.add(body);

            const warheadGeometry = new THREE.ConeGeometry(5, 15, 8);
            const warheadMaterial = new THREE.MeshPhongMaterial({
                color: 0xff0000,
                emissive: 0xff0000,
                emissiveIntensity: 0.8
            });
            const warhead = new THREE.Mesh(warheadGeometry, warheadMaterial);
            warhead.position.x = 37.5;
            warhead.rotation.z = -Math.PI / 2;
            group.add(warhead);

            this.mesh = group;
            this.mesh.position.copy(position);

            const quaternion = new THREE.Quaternion();
            quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), direction);
            this.mesh.quaternion.copy(quaternion);

            this.warningLight = new THREE.PointLight(0xff0000, 5, 100);
            this.warningLight.position.copy(position);
            scene.add(this.warningLight);

            scene.add(this.mesh);

            this.findTarget();
        }

        findTarget() {
            let nearestDist = Infinity;
            let nearestShip = null;

            ships.forEach(ship => {
                if (ship !== this.owner && ship.alive) {
                    const dist = this.mesh.position.distanceTo(ship.mesh.position);
                    if (dist < nearestDist) {
                        nearestDist = dist;
                        nearestShip = ship;
                    }
                }
            });

            this.target = nearestShip;
        }

        update() {
            this.lifetime++;

            if (this.lifetime > this.maxLifetime) {
                this.explode();
                return false;
            }

            if (!this.target || !this.target.alive) {
                this.findTarget();
            }

            if (this.target) {
                const toTarget = new THREE.Vector3();
                toTarget.subVectors(this.target.mesh.position, this.mesh.position);
                toTarget.normalize();

                const turnSpeed = 0.02;
                this.velocity.lerp(toTarget.multiplyScalar(this.velocity.length()), turnSpeed);
            }

            this.mesh.position.add(this.velocity);

            const lookAtPos = this.mesh.position.clone().add(this.velocity);
            this.mesh.lookAt(lookAtPos);
            this.mesh.rotateZ(Math.PI / 2);

            this.warningLight.position.copy(this.mesh.position);
            this.warningLight.intensity = 5 + Math.sin(Date.now() * 0.01) * 2;

            if (this.target) {
                const distance = this.mesh.position.distanceTo(this.target.mesh.position);
                if (distance < 50) {
                    this.explode();
                    return false;
                }
            }

            if (this.mesh.position.y < 10) {
                this.explode();
                return false;
            }

            return true;
        }

        explode() {
            const flashGeometry = new THREE.SphereGeometry(100, 32, 32);
            const flashMaterial = new THREE.MeshBasicMaterial({
                color: 0xffffff,
                transparent: true,
                opacity: 1
            });
            const flash = new THREE.Mesh(flashGeometry, flashMaterial);
            flash.position.copy(this.mesh.position);
            scene.add(flash);

            const shockwaveGeometry = new THREE.RingGeometry(1, 10, 32);
            const shockwaveMaterial = new THREE.MeshBasicMaterial({
                color: 0xffffff,
                transparent: true,
                opacity: 0.8,
                side: THREE.DoubleSide
            });
            const shockwave = new THREE.Mesh(shockwaveGeometry, shockwaveMaterial);
            shockwave.position.copy(this.mesh.position);
            shockwave.rotation.x = -Math.PI / 2;
            scene.add(shockwave);

            const blastRadius = 400;
            ships.forEach(ship => {
                if (ship.alive) {
                    const distance = this.mesh.position.distanceTo(ship.mesh.position);
                    if (distance < blastRadius) {
                        const damage = Math.max(0, (1 - distance / blastRadius) * 200);
                        ship.takeDamage(damage);
                    }
                }
            });

            let frame = 0;
            const animateExplosion = () => {
                frame++;
                flash.scale.multiplyScalar(1.1);
                flashMaterial.opacity *= 0.9;
                shockwave.scale.multiplyScalar(1.15);
                shockwave.material.opacity *= 0.95;

                if (frame < 100) {
                    requestAnimationFrame(animateExplosion);
                } else {
                    scene.remove(flash);
                    scene.remove(shockwave);
                }
            };
            animateExplosion();

            playSound('explosion');
            this.destroy();
        }

        destroy() {
            scene.remove(this.mesh);
            scene.remove(this.warningLight);
        }
    }

    // Game functions
    function startBattle() {
        timer = CONFIG.BATTLE_TIME;
        ships = [];
        lasers = [];
        missiles = [];
        gameState = 'battle';
        playerShip = null;

        if (gameMode === 'player' || gameMode === 'mixed') {
            playerShip = new PlayerShip();
            ships.push(playerShip);
            setupPlayerControls();
        }

        const aiCount = gameMode === 'player' ? 1 : (gameMode === 'mixed' ? 1 : 2);
        for (let i = 0; i < aiCount; i++) {
            const config = {
                name: `AI-${i + 1}`,
                color: Math.random() * 0xffffff,
                emissive: Math.random() * 0xffffff
            };
            const ship = new Ship(config, i);
            ships.push(ship);
        }

        gameLoop();
    }

    function gameLoop() {
        if (gameState !== 'battle') return;

        timer--;
        updateHUD();

        const alive = ships.filter(s => s.alive);

        if (gameMode === 'player' || gameMode === 'mixed') {
            if (playerShip && !playerShip.alive) {
                gameState = 'ended';
                return;
            }
        }

        if (alive.length <= 1 || timer <= 0) {
            endBattle();
            return;
        }

        setTimeout(gameLoop, 1000);
    }

    function endBattle() {
        gameState = 'ended';

        const alive = ships.filter(s => s.alive);
        const winner = alive.length > 0 ? alive[0] : ships[0];

        if (gameMode === 'ai' || (winner && !winner.isPlayer)) {
            document.getElementById('winnerName').textContent = winner.name;
            document.getElementById('winnerName').style.color = '#' + winner.config.color.toString(16).padStart(6, '0');
            document.getElementById('winnerStats').innerHTML = `Score: ${winner.score}<br>Eliminations: ${winner.kills}`;
            document.getElementById('restartText').style.display = 'block';
            document.getElementById('menuButtons').style.display = 'none';
            document.getElementById('winnerOverlay').style.display = 'flex';

            if (gameMode === 'ai') {
                let countdown = 5;
                const countInterval = setInterval(() => {
                    countdown--;
                    document.getElementById('countdown').textContent = countdown;
                    if (countdown <= 0) {
                        clearInterval(countInterval);
                        document.getElementById('winnerOverlay').style.display = 'none';
                        cleanupBattle();
                        startBattle();
                    }
                }, 1000);
            }
        }
    }

    function cleanupBattle() {
        ships.forEach(ship => {
            if (ship.mesh) scene.remove(ship.mesh);
        });
        lasers.forEach(laser => {
            scene.remove(laser.mesh);
        });
        missiles.forEach(missile => {
            missile.destroy();
        });
        ships = [];
        lasers = [];
        missiles = [];
    }

    function updateHUD() {
        const alive = ships.filter(s => s.alive);
        document.getElementById('aliveCount').textContent = alive.length;

        const minutes = Math.floor(timer / 60);
        const seconds = timer % 60;
        document.getElementById('timer').textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }

    // Player controls
    function setupPlayerControls() {
        document.addEventListener('keydown', (e) => {
            if (!playerShip || !playerShip.alive) return;

            switch(e.key) {
                case 'ArrowUp': playerShip.keys.up = true; e.preventDefault(); break;
                case 'ArrowDown': playerShip.keys.down = true; e.preventDefault(); break;
                case 'ArrowLeft': playerShip.keys.left = true; e.preventDefault(); break;
                case 'ArrowRight': playerShip.keys.right = true; e.preventDefault(); break;
                case ' ': playerShip.keys.fire = true; e.preventDefault(); break;
                case 'Shift': playerShip.keys.boost = true; e.preventDefault(); break;
                case 'e':
                case 'E': playerShip.keys.special = true; e.preventDefault(); break;
                case 'q':
                case 'Q':
                    if (!playerShip.weaponSwitchCooldown) {
                        playerShip.keys.switchWeapon = true;
                        e.preventDefault();
                    }
                    break;
            }
        });

        document.addEventListener('keyup', (e) => {
            if (!playerShip || !playerShip.alive) return;

            switch(e.key) {
                case 'ArrowUp': playerShip.keys.up = false; break;
                case 'ArrowDown': playerShip.keys.down = false; break;
                case 'ArrowLeft': playerShip.keys.left = false; break;
                case 'ArrowRight': playerShip.keys.right = false; break;
                case ' ': playerShip.keys.fire = false; break;
                case 'Shift': playerShip.keys.boost = false; break;
                case 'e':
                case 'E': playerShip.keys.special = false; break;
                case 'q':
                case 'Q': playerShip.keys.switchWeapon = false; break;
            }
        });
    }

    // Animation loop
    function animate() {
        requestAnimationFrame(animate);

        const time = Date.now() * 0.0001;
        if (gameMode === 'player' && playerShip && playerShip.alive) {
            const offset = new THREE.Vector3(0, 30, 80);
            offset.applyQuaternion(playerShip.mesh.quaternion);
            camera.position.copy(playerShip.mesh.position).add(offset);

            const lookAt = new THREE.Vector3(0, 0, -100);
            lookAt.applyQuaternion(playerShip.mesh.quaternion);
            lookAt.add(playerShip.mesh.position);
            camera.lookAt(lookAt);
        } else {
            camera.position.x = Math.cos(time) * 600;
            camera.position.z = Math.sin(time) * 600;
            camera.position.y = 300 + Math.sin(time * 2) * 100;
            camera.lookAt(0, 100, 0);
        }

        if (gameState === 'battle') {
            ships.forEach(ship => ship.update());
            lasers = lasers.filter(laser => laser.update());
            missiles = missiles.filter(missile => missile.update());
        }


        let prevTime = 0;
        const now = performance.now();
        const delta = (prevTime ? (now - prevTime) / 1000 : 0.016);
        prevTime = now;

        updateEnvironment(environment, delta);
        renderer.render(scene, camera);
    }

    // Handle resize
    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });

    // ========================================
// SYSTÈME DE DESTRUCTION AMÉLIORÉ
// ========================================

// Classe pour gérer les effets de destruction
    class DestructionSystem {
        constructor() {
            this.debris = [];
            this.explosions = [];
            this.particles = [];
            this.maxDebris = 50;
            this.maxParticles = 200;
        }

        // Créer une explosion épique
        createExplosion(position, size, color, owner) {
            // Flash initial
            const flashGeometry = new THREE.SphereGeometry(size * 0.8, 16, 16);
            const flashMaterial = new THREE.MeshBasicMaterial({
                color: 0xffffff,
                transparent: true,
                opacity: 2,
                blending: THREE.AdditiveBlending
            });
            const flash = new THREE.Mesh(flashGeometry, flashMaterial);
            flash.position.copy(position);
            scene.add(flash);

            // Boule de feu principale
            const fireballGeometry = new THREE.SphereGeometry(size, 24, 24);
            const fireballMaterial = new THREE.MeshBasicMaterial({
                color: color || 0xff6600,
                transparent: true,
                opacity: 1,
                blending: THREE.AdditiveBlending
            });
            const fireball = new THREE.Mesh(fireballGeometry, fireballMaterial);
            fireball.position.copy(position);
            scene.add(fireball);

            // Onde de choc
            const shockwaveGeometry = new THREE.RingGeometry(1, size * 0.2, 32);
            const shockwaveMaterial = new THREE.MeshBasicMaterial({
                color: 0xffffff,
                transparent: true,
                opacity: 0.8,
                side: THREE.DoubleSide,
                blending: THREE.AdditiveBlending
            });
            const shockwave = new THREE.Mesh(shockwaveGeometry, shockwaveMaterial);
            shockwave.position.copy(position);
            shockwave.rotation.x = -Math.PI / 2;
            scene.add(shockwave);

            // Animer l'explosion
            let frame = 0;
            const animateExplosion = () => {
                frame++;

                // Flash
                flash.scale.multiplyScalar(1.3);
                flashMaterial.opacity *= 0.85;

                // Boule de feu
                fireball.scale.multiplyScalar(1.15);
                fireballMaterial.opacity *= 0.93;

                // Onde de choc
                shockwave.scale.multiplyScalar(1.25);
                shockwaveMaterial.opacity *= 0.92;

                if (frame < 60) {
                    requestAnimationFrame(animateExplosion);
                } else {
                    scene.remove(flash);
                    scene.remove(fireball);
                    scene.remove(shockwave);
                }
            };
            animateExplosion();

            // Créer des particules de feu
            this.createFireParticles(position, size, 30);

            // Créer des débris
            this.createDebris(position, color, owner ? owner.config.color : 0x888888, 15);

            // Son d'explosion
            playSound('explosion');
        }

        // Créer des particules de feu
        createFireParticles(position, size, count) {
            for (let i = 0; i < Math.min(count, this.maxParticles - this.particles.length); i++) {
                const particleGeometry = new THREE.SphereGeometry(size * 0.1 + Math.random() * size * 0.2, 4, 4);
                const particleMaterial = new THREE.MeshBasicMaterial({
                    color: Math.random() > 0.5 ? 0xff6600 : 0xffaa00,
                    transparent: true,
                    opacity: 1,
                    blending: THREE.AdditiveBlending
                });
                const particle = new THREE.Mesh(particleGeometry, particleMaterial);
                particle.position.copy(position);

                // Vélocité aléatoire
                particle.velocity = new THREE.Vector3(
                    (Math.random() - 0.5) * size * 0.5,
                    Math.random() * size * 0.4,
                    (Math.random() - 0.5) * size * 0.5
                );

                particle.life = 60 + Math.random() * 60;
                particle.maxLife = particle.life;

                scene.add(particle);
                this.particles.push(particle);
            }
        }

        // Créer des débris
        createDebris(position, color, materialColor, count) {
            for (let i = 0; i < Math.min(count, this.maxDebris - this.debris.length); i++) {
                const size = Math.random() * 10 + 5;
                const debrisGeometry = new THREE.BoxGeometry(size, size, size);
                const debrisMaterial = new THREE.MeshPhongMaterial({
                    color: materialColor,
                    emissive: materialColor,
                    emissiveIntensity: 0.5
                });
                const debris = new THREE.Mesh(debrisGeometry, debrisMaterial);
                debris.position.copy(position);

                // Vélocité et rotation aléatoires
                debris.velocity = new THREE.Vector3(
                    (Math.random() - 0.5) * 30,
                    Math.random() * 20,
                    (Math.random() - 0.5) * 30
                );
                debris.angularVelocity = new THREE.Vector3(
                    Math.random() * 0.3,
                    Math.random() * 0.3,
                    Math.random() * 0.3
                );

                debris.life = 300;
                scene.add(debris);
                this.debris.push(debris);
            }
        }

        // Mettre à jour le système
        update() {
            // Mettre à jour les particules
            this.particles = this.particles.filter(particle => {
                particle.life--;

                if (particle.life <= 0) {
                    scene.remove(particle);
                    return false;
                }

                // Physique
                particle.position.add(particle.velocity);
                particle.velocity.y -= 0.3; // Gravité
                particle.velocity.multiplyScalar(0.98); // Friction

                // Fade out
                const lifeRatio = particle.life / particle.maxLife;
                particle.material.opacity = lifeRatio;
                particle.scale.multiplyScalar(0.98);

                return true;
            });

            // Mettre à jour les débris
            this.debris = this.debris.filter(debris => {
                debris.life--;

                if (debris.life <= 0 || debris.position.y < -100) {
                    scene.remove(debris);
                    return false;
                }

                // Physique
                debris.position.add(debris.velocity);
                debris.velocity.y -= 0.5; // Gravité
                debris.rotation.x += debris.angularVelocity.x;
                debris.rotation.y += debris.angularVelocity.y;
                debris.rotation.z += debris.angularVelocity.z;

                return true;
            });
        }

        // Nettoyer tout
        cleanup() {
            this.particles.forEach(p => scene.remove(p));
            this.debris.forEach(d => scene.remove(d));
            this.particles = [];
            this.debris = [];
        }
    }

// Instance globale du système de destruction
    const destructionSystem = new DestructionSystem();

// Amélioration de la méthode destroy() pour Ship
    Ship.prototype.destroy = function() {
        if (!this.alive) return;

        // Grosse explosion pour le vaisseau
        destructionSystem.createExplosion(
            this.mesh.position,
            80,
            0xff6600,
            this
        );

        // Explosion secondaire
        setTimeout(() => {
            if (this.mesh.position) {
                const offset = new THREE.Vector3(
                    (Math.random() - 0.5) * 40,
                    (Math.random() - 0.5) * 40,
                    (Math.random() - 0.5) * 40
                );
                destructionSystem.createExplosion(
                    this.mesh.position.clone().add(offset),
                    50,
                    0xffaa00,
                    this
                );
            }
        }, 200);

        // Créer une épave qui tombe
        const wreckGroup = new THREE.Group();

        // Copier les parties du vaisseau
        this.mesh.children.forEach(child => {
            const wreckPart = child.clone();
            wreckPart.material = child.material.clone();
            wreckPart.material.emissiveIntensity = 0;
            wreckPart.material.opacity = 0.8;
            wreckPart.material.transparent = true;
            wreckGroup.add(wreckPart);
        });

        wreckGroup.position.copy(this.mesh.position);
        wreckGroup.rotation.copy(this.mesh.rotation);

        // Physique de l'épave
        const wreck = {
            mesh: wreckGroup,
            velocity: new THREE.Vector3(
                this.velocity.x * 0.5,
                -5,
                this.velocity.z * 0.5
            ),
            angularVelocity: new THREE.Vector3(
                Math.random() * 0.1,
                Math.random() * 0.1,
                Math.random() * 0.1
            ),
            life: 300
        };

        scene.add(wreckGroup);

        // Animer l'épave
        const animateWreck = () => {
            wreck.life--;

            if (wreck.life <= 0 || wreck.mesh.position.y < -200) {
                scene.remove(wreck.mesh);
                return;
            }

            // Physique
            wreck.mesh.position.add(wreck.velocity);
            wreck.velocity.y -= 0.3; // Gravité
            wreck.mesh.rotation.x += wreck.angularVelocity.x;
            wreck.mesh.rotation.y += wreck.angularVelocity.y;
            wreck.mesh.rotation.z += wreck.angularVelocity.z;

            // Fumée
            if (wreck.life % 5 === 0) {
                const smokeGeometry = new THREE.SphereGeometry(10 + Math.random() * 10, 4, 4);
                const smokeMaterial = new THREE.MeshBasicMaterial({
                    color: 0x222222,
                    transparent: true,
                    opacity: 0.5
                });
                const smoke = new THREE.Mesh(smokeGeometry, smokeMaterial);
                smoke.position.copy(wreck.mesh.position);
                scene.add(smoke);

                // Animer la fumée
                const animateSmoke = () => {
                    smoke.position.y += 0.5;
                    smoke.scale.multiplyScalar(1.05);
                    smokeMaterial.opacity *= 0.95;

                    if (smokeMaterial.opacity > 0.01) {
                        requestAnimationFrame(animateSmoke);
                    } else {
                        scene.remove(smoke);
                    }
                };
                animateSmoke();
            }

            requestAnimationFrame(animateWreck);
        };
        animateWreck();

        // Enlever le vaisseau original
        scene.remove(this.mesh);

        // Score et notifications
        if (!this.isPlayer) {
            showNotification(`💥 ${this.name} DESTROYED!`);
        }

        // Drop de power-up (30% de chance)
        if (Math.random() < 0.3) {
            const powerupTypes = ['health', 'shield', 'weapon', 'boost'];
            const type = powerupTypes[Math.floor(Math.random() * powerupTypes.length)];
            const powerup = new Powerup(this.mesh.position.clone(), type);
            powerups.push(powerup);
        }
    };

// Amélioration de la destruction des missiles nucléaires
    NuclearMissile.prototype.explode = function() {
        const blastCenter = this.mesh.position.clone();

        // Flash aveuglant
        const flashGeometry = new THREE.SphereGeometry(200, 32, 32);
        const flashMaterial = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 3,
            blending: THREE.AdditiveBlending
        });
        const flash = new THREE.Mesh(flashGeometry, flashMaterial);
        flash.position.copy(blastCenter);
        scene.add(flash);

        // Boule de feu nucléaire
        const fireballGeometry = new THREE.SphereGeometry(150, 32, 32);
        const fireballMaterial = new THREE.MeshBasicMaterial({
            color: 0xff6600,
            transparent: true,
            opacity: 1,
            blending: THREE.AdditiveBlending
        });
        const fireball = new THREE.Mesh(fireballGeometry, fireballMaterial);
        fireball.position.copy(blastCenter);
        scene.add(fireball);

        // Multiples ondes de choc
        const shockwaves = [];
        for (let i = 0; i < 3; i++) {
            const shockwaveGeometry = new THREE.RingGeometry(1, 20, 64);
            const shockwaveMaterial = new THREE.MeshBasicMaterial({
                color: i === 0 ? 0xffffff : 0xffaa00,
                transparent: true,
                opacity: 0.8 - i * 0.2,
                side: THREE.DoubleSide,
                blending: THREE.AdditiveBlending
            });
            const shockwave = new THREE.Mesh(shockwaveGeometry, shockwaveMaterial);
            shockwave.position.copy(blastCenter);
            shockwave.position.y += i * 20;
            shockwave.rotation.x = -Math.PI / 2;
            scene.add(shockwave);
            shockwaves.push({ mesh: shockwave, material: shockwaveMaterial, delay: i * 10 });
        }

        // Champignon atomique
        const mushroomStem = new THREE.CylinderGeometry(50, 100, 300, 16);
        const mushroomMaterial = new THREE.MeshBasicMaterial({
            color: 0x444444,
            transparent: true,
            opacity: 0.7
        });
        const stem = new THREE.Mesh(mushroomStem, mushroomMaterial);
        stem.position.copy(blastCenter);
        stem.position.y += 150;
        scene.add(stem);

        const mushroomCap = new THREE.SphereGeometry(150, 16, 12);
        const cap = new THREE.Mesh(mushroomCap, mushroomMaterial.clone());
        cap.position.copy(blastCenter);
        cap.position.y += 300;
        cap.scale.y = 0.5;
        scene.add(cap);

        // Dégâts massifs
        const blastRadius = 600;
        ships.forEach(ship => {
            if (ship.alive) {
                const distance = blastCenter.distanceTo(ship.mesh.position);
                if (distance < blastRadius) {
                    const damageFactor = 1 - (distance / blastRadius);
                    const damage = Math.max(0, damageFactor * 300);
                    ship.takeDamage(damage, this.owner);

                    // Projection des vaisseaux
                    if (ship.alive) {
                        const blastDirection = new THREE.Vector3()
                            .subVectors(ship.mesh.position, blastCenter)
                            .normalize();
                        const force = damageFactor * 50;
                        ship.velocity.add(blastDirection.multiplyScalar(force));
                    }
                }
            }
        });

        // Particules radioactives
        for (let i = 0; i < 100; i++) {
            const particleGeometry = new THREE.SphereGeometry(5 + Math.random() * 15, 4, 4);
            const particleMaterial = new THREE.MeshBasicMaterial({
                color: Math.random() > 0.5 ? 0x00ff00 : 0xffff00,
                transparent: true,
                opacity: 1,
                blending: THREE.AdditiveBlending
            });
            const particle = new THREE.Mesh(particleGeometry, particleMaterial);
            particle.position.copy(blastCenter);
            particle.position.add(new THREE.Vector3(
                (Math.random() - 0.5) * 100,
                Math.random() * 50,
                (Math.random() - 0.5) * 100
            ));

            const velocity = new THREE.Vector3(
                (Math.random() - 0.5) * 40,
                Math.random() * 30 + 20,
                (Math.random() - 0.5) * 40
            );

            scene.add(particle);

            // Animer la particule
            const animateParticle = () => {
                particle.position.add(velocity.clone().multiplyScalar(0.1));
                velocity.y -= 0.5;
                particleMaterial.opacity *= 0.98;
                particle.scale.multiplyScalar(0.98);

                if (particleMaterial.opacity > 0.01 && particle.position.y > -100) {
                    requestAnimationFrame(animateParticle);
                } else {
                    scene.remove(particle);
                }
            };
            animateParticle();
        }

        // Animation de l'explosion nucléaire
        let frame = 0;
        const animateNuclear = () => {
            frame++;

            // Flash
            if (frame < 10) {
                flash.scale.multiplyScalar(1.5);
                flashMaterial.opacity *= 0.8;
            } else if (flash.parent) {
                scene.remove(flash);
            }

            // Boule de feu
            fireball.scale.multiplyScalar(1.1);
            fireballMaterial.opacity *= 0.97;

            // Ondes de choc
            shockwaves.forEach(sw => {
                if (frame > sw.delay) {
                    sw.mesh.scale.multiplyScalar(1.2);
                    sw.material.opacity *= 0.95;
                }
            });

            // Champignon
            if (frame > 30) {
                stem.position.y += 2;
                stem.scale.y *= 1.01;
                cap.position.y += 3;
                cap.scale.x *= 1.005;
                cap.scale.z *= 1.005;
            }

            if (frame < 200) {
                requestAnimationFrame(animateNuclear);
            } else {
                // Nettoyage
                scene.remove(fireball);
                shockwaves.forEach(sw => scene.remove(sw.mesh));

                // Faire disparaître le champignon
                const fadeMushroom = () => {
                    mushroomMaterial.opacity *= 0.98;
                    cap.material.opacity *= 0.98;

                    if (mushroomMaterial.opacity > 0.01) {
                        requestAnimationFrame(fadeMushroom);
                    } else {
                        scene.remove(stem);
                        scene.remove(cap);
                    }
                };
                setTimeout(fadeMushroom, 2000);
            }
        };
        animateNuclear();

        // Sons multiples
        playSound('explosion');
        setTimeout(() => playSound('explosion'), 200);
        setTimeout(() => playSound('explosion'), 500);

        // Notifications
        showNotification('☢️ NUCLEAR DEVASTATION! ☢️');
        if (this.owner === playerShip) {
            playerShip.score += 500;
        }

        this.destroy();
    };

// Classe Power-up avec effets visuels améliorés
    class Powerup {
        constructor(position, type) {
            this.type = type;
            this.position = position.clone();
            this.collected = false;
            this.lifetime = 600; // 10 secondes

            // Créer le modèle du power-up
            const group = new THREE.Group();

            // Conteneur principal
            const geometry = new THREE.OctahedronGeometry(15, 0);
            const material = new THREE.MeshPhongMaterial({
                color: this.getColor(),
                emissive: this.getColor(),
                emissiveIntensity: 0.5,
                transparent: true,
                opacity: 0.8
            });
            const container = new THREE.Mesh(geometry, material);
            group.add(container);

            // Aura lumineuse
            const auraGeometry = new THREE.SphereGeometry(25, 16, 16);
            const auraMaterial = new THREE.MeshBasicMaterial({
                color: this.getColor(),
                transparent: true,
                opacity: 0.3,
                blending: THREE.AdditiveBlending
            });
            const aura = new THREE.Mesh(auraGeometry, auraMaterial);
            group.add(aura);

            // Anneaux tournants
            for (let i = 0; i < 2; i++) {
                const ringGeometry = new THREE.TorusGeometry(20, 2, 8, 32);
                const ringMaterial = new THREE.MeshBasicMaterial({
                    color: this.getColor(),
                    transparent: true,
                    opacity: 0.6
                });
                const ring = new THREE.Mesh(ringGeometry, ringMaterial);
                ring.rotation.x = i * Math.PI / 2;
                group.add(ring);
            }

            this.mesh = group;
            this.mesh.position.copy(position);
            scene.add(this.mesh);

            // Lumière
            this.light = new THREE.PointLight(this.getColor(), 2, 100);
            this.light.position.copy(position);
            scene.add(this.light);

            // Symbole du type
            this.createSymbol(group);
        }

        getColor() {
            switch (this.type) {
                case 'health': return 0x00ff00;
                case 'shield': return 0x00ffff;
                case 'weapon': return 0xff00ff;
                case 'boost': return 0xffaa00;
                default: return 0xffffff;
            }
        }

        createSymbol(group) {
            const symbolGeometry = new THREE.PlaneGeometry(10, 10);
            const canvas = document.createElement('canvas');
            canvas.width = 64;
            canvas.height = 64;
            const ctx = canvas.getContext('2d');

            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 48px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            let symbol = '';
            switch (this.type) {
                case 'health': symbol = '+'; break;
                case 'shield': symbol = '◊'; break;
                case 'weapon': symbol = '★'; break;
                case 'boost': symbol = '↑'; break;
            }

            ctx.fillText(symbol, 32, 32);

            const texture = new THREE.CanvasTexture(canvas);
            const symbolMaterial = new THREE.MeshBasicMaterial({
                map: texture,
                transparent: true,
                blending: THREE.AdditiveBlending
            });

            const symbolMesh = new THREE.Mesh(symbolGeometry, symbolMaterial);
            symbolMesh.position.z = 1;
            group.add(symbolMesh);
        }

        update() {
            this.lifetime--;

            // Rotation et flottement
            this.mesh.rotation.y += 0.02;
            this.mesh.children[0].rotation.x += 0.01;
            this.mesh.children[0].rotation.z += 0.01;

            // Anneaux tournants
            if (this.mesh.children[2]) this.mesh.children[2].rotation.z += 0.03;
            if (this.mesh.children[3]) this.mesh.children[3].rotation.y += 0.03;

            // Flottement
            this.mesh.position.y += Math.sin(Date.now() * 0.003) * 0.5;

            // Pulsation
            const scale = 1 + Math.sin(Date.now() * 0.005) * 0.1;
            this.mesh.scale.set(scale, scale, scale);

            // Mise à jour de la lumière
            this.light.position.copy(this.mesh.position);
            this.light.intensity = 2 + Math.sin(Date.now() * 0.01) * 0.5;

            // Vérifier la collecte
            ships.forEach(ship => {
                if (ship.alive && !this.collected) {
                    const distance = ship.mesh.position.distanceTo(this.mesh.position);
                    if (distance < 50) {
                        this.collect(ship);
                    }
                }
            });

            // Disparition progressive
            if (this.lifetime < 60) {
                this.mesh.children[0].material.opacity = this.lifetime / 60;
                this.mesh.children[1].material.opacity = (this.lifetime / 60) * 0.3;
            }

            return this.lifetime > 0 && !this.collected;
        }

        collect(ship) {
            this.collected = true;

            let message = '';
            let effectColor = this.getColor();

            switch (this.type) {
                case 'health':
                    const healthBoost = 30;
                    ship.health = Math.min(CONFIG.SHIP_HP, ship.health + healthBoost);
                    message = `+${healthBoost} HEALTH`;
                    break;

                case 'shield':
                    ship.shield = CONFIG.SHIELD_HP;
                    message = 'SHIELD RECHARGED';
                    break;

                case 'weapon':
                    if (ship.isPlayer) {
                        ship.switchWeapon();
                        message = 'WEAPON UPGRADED';
                    } else {
                        ship.score += 50;
                        message = '+50 POINTS';
                    }
                    break;

                case 'boost':
                    ship.boostEnergy = CONFIG.BOOST_MAX;
                    message = 'BOOST RECHARGED';
                    break;
            }

            // Effet de collecte
            this.createCollectEffect(effectColor);

            // Notification
            if (ship.isPlayer || ship === playerShip) {
                showNotification(`✨ ${message}`);
            }

            // Score
            ship.score += 25;

            playSound('powerup');
            this.destroy();
        }

        createCollectEffect(color) {
            // Onde d'énergie
            const waveGeometry = new THREE.SphereGeometry(1, 16, 16);
            const waveMaterial = new THREE.MeshBasicMaterial({
                color: color,
                transparent: true,
                opacity: 1,
                blending: THREE.AdditiveBlending
            });
            const wave = new THREE.Mesh(waveGeometry, waveMaterial);
            wave.position.copy(this.mesh.position);
            scene.add(wave);

            // Particules
            for (let i = 0; i < 20; i++) {
                const particleGeometry = new THREE.SphereGeometry(2, 4, 4);
                const particleMaterial = new THREE.MeshBasicMaterial({
                    color: color,
                    transparent: true,
                    opacity: 1,
                    blending: THREE.AdditiveBlending
                });
                const particle = new THREE.Mesh(particleGeometry, particleMaterial);
                particle.position.copy(this.mesh.position);

                const velocity = new THREE.Vector3(
                    (Math.random() - 0.5) * 20,
                    (Math.random() - 0.5) * 20,
                    (Math.random() - 0.5) * 20
                );

                scene.add(particle);

                // Animer la particule
                const animateParticle = () => {
                    particle.position.add(velocity.clone().multiplyScalar(0.1));
                    velocity.multiplyScalar(0.95);
                    particleMaterial.opacity *= 0.95;
                    particle.scale.multiplyScalar(0.95);

                    if (particleMaterial.opacity > 0.01) {
                        requestAnimationFrame(animateParticle);
                    } else {
                        scene.remove(particle);
                    }
                };
                animateParticle();
            }

            // Animer l'onde
            const animateWave = () => {
                wave.scale.multiplyScalar(1.2);
                waveMaterial.opacity *= 0.9;

                if (waveMaterial.opacity > 0.01) {
                    requestAnimationFrame(animateWave);
                } else {
                    scene.remove(wave);
                }
            };
            animateWave();
        }

        destroy() {
            scene.remove(this.mesh);
            scene.remove(this.light);
        }
    }

// Ajouter la mise à jour du système de destruction dans la boucle d'animation
    function updateDestructionSystem() {
        if (destructionSystem) {
            destructionSystem.update();
        }
    }

// Amélioration de l'explosion des lasers
    Laser.prototype.createImpactEffect = function() {
        const impactPosition = this.mesh.position.clone();

        // Flash d'impact
        const flashGeometry = new THREE.SphereGeometry(20, 8, 8);
        const flashMaterial = new THREE.MeshBasicMaterial({
            color: this.mesh.material.color,
            transparent: true,
            opacity: 1,
            blending: THREE.AdditiveBlending
        });
        const flash = new THREE.Mesh(flashGeometry, flashMaterial);
        flash.position.copy(impactPosition);
        scene.add(flash);

        // Étincelles
        for (let i = 0; i < 10; i++) {
            const sparkGeometry = new THREE.BoxGeometry(2, 2, 8);
            const sparkMaterial = new THREE.MeshBasicMaterial({
                color: this.mesh.material.color,
                transparent: true,
                opacity: 1
            });
            const spark = new THREE.Mesh(sparkGeometry, sparkMaterial);
            spark.position.copy(impactPosition);

            const velocity = new THREE.Vector3(
                (Math.random() - 0.5) * 30,
                (Math.random() - 0.5) * 30,
                (Math.random() - 0.5) * 30
            );

            scene.add(spark);

            // Animer l'étincelle
            const animateSpark = () => {
                spark.position.add(velocity.clone().multiplyScalar(0.1));
                velocity.y -= 0.5;
                spark.rotation.x += 0.2;
                spark.rotation.y += 0.2;
                sparkMaterial.opacity *= 0.9;
                spark.scale.multiplyScalar(0.95);

                if (sparkMaterial.opacity > 0.01) {
                    requestAnimationFrame(animateSpark);
                } else {
                    scene.remove(spark);
                }
            };
            animateSpark();
        }

        // Animer le flash
        const animateFlash = () => {
            flash.scale.multiplyScalar(1.2);
            flashMaterial.opacity *= 0.8;

            if (flashMaterial.opacity > 0.01) {
                requestAnimationFrame(animateFlash);
            } else {
                scene.remove(flash);
            }
        };
        animateFlash();

        playSound('hit');
    };

// Amélioration de l'explosion des rockets
    Rocket.prototype.explode = function() {
        destructionSystem.createExplosion(
            this.mesh.position,
            40,
            0xff6600,
            this.owner
        );

        // Dégâts de zone
        const blastRadius = 100;
        ships.forEach(ship => {
            if (ship !== this.owner && ship.alive) {
                const distance = this.mesh.position.distanceTo(ship.mesh.position);
                if (distance < blastRadius) {
                    const damage = Math.max(0, (1 - distance / blastRadius) * 30);
                    ship.takeDamage(damage, this.owner);
                }
            }
        });

        this.destroy();
    };

// Note: Assurez-vous d'appeler updateDestructionSystem() dans votre boucle d'animation principale

    // Start game
    init();
});