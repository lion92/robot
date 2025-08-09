// ========================
// GAME LOGIC CONTINUATION
// ========================

// Continue PlayerShip destroy method
getElementById('winnerOverlay').style.display = 'flex';

playSound('explosion');
}
}

// Laser class (Optimized)
class Laser {
    constructor(position, direction, color, owner) {
        this.owner = owner;
        this.damage = CONFIG.DAMAGE;
        this.velocity = direction.multiplyScalar(CONFIG.LASER_SPEED);
        this.life = 120; // 2 seconds

        // Simple laser visual
        const geometry = new THREE.CylinderGeometry(1, 1, 30, 4);
        const material = new THREE.MeshBasicMaterial({
            color: color,
            transparent: true,
            opacity: 0.9
        });

        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.position.copy(position);

        // Align with direction
        const quaternion = new THREE.Quaternion();
        quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
        this.mesh.quaternion.copy(quaternion);

        scene.add(this.mesh);
    }

    update() {
        this.mesh.position.add(this.velocity.clone().multiplyScalar(0.1));
        this.life--;

        // Check boundaries
        if (this.mesh.position.length() > CONFIG.ARENA_SIZE * 1.5 || this.life <= 0) {
            this.destroy();
            return false;
        }

        // Check collisions
        for (let ship of ships) {
            if (ship !== this.owner && ship.alive) {
                const distance = this.mesh.position.distanceTo(ship.mesh.position);
                if (distance < 40) {
                    ship.takeDamage(this.damage, this.owner);
                    this.createHitEffect();
                    this.destroy();
                    return false;
                }
            }
        }

        return true;
    }

    createHitEffect() {
        // Simple hit effect using particle pool
        if (particles.length < CONFIG.MAX_PARTICLES) {
            for (let i = 0; i < 5; i++) {
                const particle = {
                    position: this.mesh.position.clone(),
                    velocity: new THREE.Vector3(
                        (Math.random() - 0.5) * 10,
                        (Math.random() - 0.5) * 10,
                        (Math.random() - 0.5) * 10
                    ),
                    life: 15,
                    color: this.mesh.material.color,
                    size: 3
                };
                particles.push(particle);
            }
        }
    }

    destroy() {
        scene.remove(this.mesh);
    }
}

// Nuclear Missile class (Simplified)
class NuclearMissile {
    constructor(position, direction, owner) {
        this.owner = owner;
        this.velocity = direction.normalize().multiplyScalar(CONFIG.LASER_SPEED * 0.5);
        this.lifetime = 0;
        this.maxLifetime = 300; // 5 seconds

        // Simple missile model
        const geometry = new THREE.ConeGeometry(5, 40, 6);
        const material = new THREE.MeshPhongMaterial({
            color: 0xff0000,
            emissive: 0xff0000,
            emissiveIntensity: 0.5
        });

        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.position.copy(position);

        // Align with direction
        const quaternion = new THREE.Quaternion();
        quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
        this.mesh.quaternion.copy(quaternion);

        scene.add(this.mesh);

        showNotification('⚠️ NUCLEAR MISSILE DETECTED! ⚠️', 'powerup');
        playSound('alarm');
    }

    update() {
        this.lifetime++;

        if (this.lifetime > this.maxLifetime) {
            this.explode();
            return false;
        }

        // Update position
        this.mesh.position.add(this.velocity.clone().multiplyScalar(0.1));

        // Simple homing
        if (this.lifetime > 30) {
            let nearestShip = null;
            let nearestDist = 500;

            ships.forEach(ship => {
                if (ship !== this.owner && ship.alive) {
                    const dist = this.mesh.position.distanceTo(ship.mesh.position);
                    if (dist < nearestDist) {
                        nearestDist = dist;
                        nearestShip = ship;
                    }
                }
            });

            if (nearestShip) {
                const toTarget = new THREE.Vector3().subVectors(
                    nearestShip.mesh.position,
                    this.mesh.position
                );
                toTarget.normalize();
                this.velocity.lerp(toTarget.multiplyScalar(this.velocity.length()), 0.02);
            }
        }

        // Check for impact
        if (this.mesh.position.y < 10) {
            this.explode();
            return false;
        }

        ships.forEach(ship => {
            if (ship !== this.owner && ship.alive) {
                const distance = this.mesh.position.distanceTo(ship.mesh.position);
                if (distance < 50) {
                    this.explode();
                    return false;
                }
            }
        });

        return true;
    }

    explode() {
        const blastCenter = this.mesh.position.clone();
        const blastRadius = 400;

        // Damage all ships in radius
        ships.forEach(ship => {
            if (ship.alive) {
                const distance = blastCenter.distanceTo(ship.mesh.position);
                if (distance < blastRadius) {
                    const damageFactor = 1 - (distance / blastRadius);
                    const damage = Math.max(0, damageFactor * 200);
                    ship.takeDamage(damage, this.owner);

                    // Knockback
                    const knockback = new THREE.Vector3();
                    knockback.subVectors(ship.mesh.position, blastCenter);
                    knockback.normalize();
                    knockback.multiplyScalar(damageFactor * 30);
                    ship.velocity.add(knockback);
                }
            }
        });

        // Create explosion effect
        if (particles.length < CONFIG.MAX_PARTICLES - 30) {
            for (let i = 0; i < 30; i++) {
                const particle = {
                    position: blastCenter.clone(),
                    velocity: new THREE.Vector3(
                        (Math.random() - 0.5) * 60,
                        Math.random() * 40,
                        (Math.random() - 0.5) * 60
                    ),
                    life: 60,
                    color: Math.random() > 0.5 ? 0xff6600 : 0xffff00,
                    size: 10 + Math.random() * 20
                };
                particles.push(particle);
            }
        }

        playSound('explosion');
        this.destroy();
    }

    destroy() {
        scene.remove(this.mesh);
    }
}

// Powerup class (Simplified)
class Powerup {
    constructor(position, type) {
        this.type = type;
        this.position = position.clone();
        this.collected = false;
        this.lifetime = 600; // 10 seconds

        // Simple powerup model
        const geometry = new THREE.OctahedronGeometry(15, 0);
        const material = new THREE.MeshPhongMaterial({
            color: this.getColor(),
            emissive: this.getColor(),
            emissiveIntensity: 0.5
        });

        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.position.copy(position);
        scene.add(this.mesh);
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

    update() {
        this.lifetime--;

        // Rotation
        this.mesh.rotation.y += 0.02;
        this.mesh.rotation.x += 0.01;

        // Floating motion
        this.mesh.position.y += Math.sin(Date.now() * 0.003) * 0.5;

        // Check collection
        ships.forEach(ship => {
            if (ship.alive && !this.collected) {
                const distance = ship.mesh.position.distanceTo(this.mesh.position);
                if (distance < 50) {
                    this.collect(ship);
                }
            }
        });

        return this.lifetime > 0 && !this.collected;
    }

    collect(ship) {
        this.collected = true;

        let message = '';

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
                ship.score += 50;
                message = '+50 POINTS';
                break;

            case 'boost':
                ship.boostEnergy = CONFIG.BOOST_MAX;
                message = 'BOOST RECHARGED';
                break;
        }

        if (ship.isPlayer || ship === playerShip) {
            showNotification(`✨ ${message}`, 'powerup');
        }

        playSound('powerup');
        this.destroy();
    }

    destroy() {
        scene.remove(this.mesh);
    }
}

// Particle System (Optimized)
function updateParticles() {
    particles = particles.filter((particle, index) => {
        particle.life--;

        if (particle.life <= 0) {
            if (particle.mesh) {
                particle.mesh.visible = false;
            }
            return false;
        }

        // Update position
        particle.position.add(particle.velocity.clone().multiplyScalar(0.1));

        // Apply gravity to some particles
        if (particle.type === 'debris' || particle.type === 'fragment') {
            particle.velocity.y -= CONFIG.GRAVITY * 0.5;
        }

        // Get or create visual
        if (!particle.mesh) {
            particle.mesh = getPooledParticle();
            particle.mesh.visible = true;
            particle.mesh.material.color.setHex(particle.color);
            particle.mesh.scale.setScalar(particle.size / 5);
        }

        particle.mesh.position.copy(particle.position);

        // Fade out
        const lifeRatio = particle.life / 60;
        particle.mesh.material.opacity = lifeRatio;

        return true;
    });

    // Limit particles
    if (particles.length > CONFIG.MAX_PARTICLES) {
        particles.splice(CONFIG.MAX_PARTICLES);
    }
}

// Menu functions
function startPlayerMode() {
    gameMode = 'player';
    document.getElementById('mainMenu').style.display = 'none';
    document.getElementById('playerHUD').style.display = 'block';
    document.getElementById('hud').style.display = 'block';
    document.getElementById('radar').style.display = 'block';
    document.getElementById('aiGeneration').style.display = 'block';
    startBattle();
}

function startMixedMode() {
    gameMode = 'mixed';
    document.getElementById('mainMenu').style.display = 'none';
    document.getElementById('playerHUD').style.display = 'block';
    document.getElementById('hud').style.display = 'block';
    document.getElementById('radar').style.display = 'block';
    document.getElementById('aiGeneration').style.display = 'block';
    startBattle();
}

function startAIMode() {
    gameMode = 'ai';
    document.getElementById('mainMenu').style.display = 'none';
    document.getElementById('hud').style.display = 'block';
    document.getElementById('aiGeneration').style.display = 'block';
    startBattle();
}

function returnToMenu() {
    gameState = 'menu';
    cleanupBattle();
    document.getElementById('mainMenu').style.display = 'flex';
    document.getElementById('playerHUD').style.display = 'none';
    document.getElementById('hud').style.display = 'none';
    document.getElementById('radar').style.display = 'none';
    document.getElementById('winnerOverlay').style.display = 'none';
    document.getElementById('aiGeneration').style.display = 'none';
    document.getElementById('comboCounter').style.display = 'none';
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

// Game Management Functions
function startBattle() {
    timer = CONFIG.BATTLE_TIME;
    ships = [];
    lasers = [];
    missiles = [];
    powerups = [];
    particles = [];
    gameState = 'battle';
    playerShip = null;
    totalKills = 0;
    comboKills = 0;

    // Create ships based on mode
    if (gameMode === 'player' || gameMode === 'mixed') {
        playerShip = new PlayerShip();
        ships.push(playerShip);
        setupPlayerControls();
    }

    // Create AI ships
    const aiCount = gameMode === 'player' ? 5 : (gameMode === 'mixed' ? 5 : 6);
    const aiColors = [
        0xff0000, // Red
        0x0000ff, // Blue  
        0xff00ff, // Magenta
        0xffff00, // Yellow
        0xff6600, // Orange
        0x00ffff  // Cyan
    ];

    for (let i = 0; i < aiCount; i++) {
        const config = {
            name: `Fighter-${i + 1}`,
            color: aiColors[i % aiColors.length]
        };
        const ship = new Ship(config, i);
        ships.push(ship);
    }

    showNotification('🚀 BATTLE COMMENCING 🚀', 'powerup');

    // Start game loop
    gameLoop();

    // Start powerup spawning
    spawnPowerups();
}

function gameLoop() {
    if (gameState !== 'battle') return;

    timer--;
    updateHUD();

    const alive = ships.filter(s => s.alive);

    // Check player death in player modes
    if ((gameMode === 'player' || gameMode === 'mixed') && playerShip && !playerShip.alive) {
        endBattle();
        return;
    }

    // Check win conditions
    if (alive.length <= 1 || timer <= 0) {
        endBattle();
        return;
    }

    // Continue loop
    setTimeout(gameLoop, 1000);
}

function spawnPowerups() {
    if (gameState !== 'battle') return;

    // Random spawn
    if (Math.random() < 0.1 && powerups.length < 3) {
        const position = new THREE.Vector3(
            (Math.random() - 0.5) * CONFIG.ARENA_SIZE * 1.5,
            50 + Math.random() * 200,
            (Math.random() - 0.5) * CONFIG.ARENA_SIZE * 1.5
        );

        const types = ['health', 'shield', 'weapon', 'boost'];
        const type = types[Math.floor(Math.random() * types.length)];

        const powerup = new Powerup(position, type);
        powerups.push(powerup);
    }

    // Continue spawning
    setTimeout(spawnPowerups, CONFIG.POWERUP_SPAWN_TIME);
}

function endBattle() {
    gameState = 'ended';

    const alive = ships.filter(s => s.alive);
    const winner = alive.length > 0 ? alive[0] : ships[0];

    // Show winner screen
    if (winner && !winner.isPlayer) {
        document.getElementById('winnerName').textContent = winner.name;
        document.getElementById('winnerName').style.color = '#' + winner.config.color.toString(16).padStart(6, '0');

        let statsText = `Final Score: ${winner.score}<br>`;
        statsText += `Eliminations: ${winner.kills}<br>`;
        statsText += `Survival Time: ${CONFIG.BATTLE_TIME - timer}s`;

        document.getElementById('winnerStats').innerHTML = statsText;
        document.getElementById('restartText').style.display = 'block';
        document.getElementById('menuButtons').style.display = 'none';
        document.getElementById('winnerOverlay').style.display = 'flex';

        // Auto-restart in AI mode
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
    } else if (winner && winner.isPlayer) {
        // Player victory
        document.getElementById('winnerName').textContent = '🎉 MISSION ACCOMPLISHED 🎉';
        document.getElementById('winnerName').style.color = '#00ff00';
        document.getElementById('winnerStats').innerHTML =
            `Final Score: ${winner.score}<br>` +
            `Eliminations: ${winner.kills}<br>` +
            `Rank: ACE PILOT`;
        document.getElementById('restartText').style.display = 'none';
        document.getElementById('menuButtons').style.display = 'block';
        document.getElementById('winnerOverlay').style.display = 'flex';

        playSound('powerup');
    }
}

function cleanupBattle() {
    // Remove all game objects
    ships.forEach(ship => {
        if (ship.mesh) scene.remove(ship.mesh);
    });

    lasers.forEach(laser => {
        if (laser.mesh) scene.remove(laser.mesh);
    });

    missiles.forEach(missile => {
        if (missile.mesh) scene.remove(missile.mesh);
    });

    powerups.forEach(powerup => {
        if (powerup.mesh) scene.remove(powerup.mesh);
    });

    particles.forEach(particle => {
        if (particle.mesh) {
            particle.mesh.visible = false;
        }
    });

    // Clear arrays
    ships = [];
    lasers = [];
    missiles = [];
    powerups = [];
    particles = [];
}

function updateHUD() {
    // Update survivor count
    const alive = ships.filter(s => s.alive);
    document.getElementById('aliveCount').textContent = alive.length;

    // Update timer
    const minutes = Math.floor(timer / 60);
    const seconds = timer % 60;
    document.getElementById('timer').textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;

    // Update kill count
    document.getElementById('killCount').textContent = totalKills;
}

// Player Controls
function setupPlayerControls() {
    // Keyboard controls
    document.addEventListener('keydown', (e) => {
        if (!playerShip || !playerShip.alive) return;

        switch(e.key.toLowerCase()) {
            case 'arrowup': playerShip.keys.up = true; e.preventDefault(); break;
            case 'arrowdown': playerShip.keys.down = true; e.preventDefault(); break;
            case 'arrowleft': playerShip.keys.left = true; e.preventDefault(); break;
            case 'arrowright': playerShip.keys.right = true; e.preventDefault(); break;
            case ' ': playerShip.keys.fire = true; e.preventDefault(); break;
            case 'shift': playerShip.keys.boost = true; e.preventDefault(); break;
            case 'e':
                if (playerShip.nuclearReady) {
                    playerShip.nuclearReady = false;
                    const direction = new THREE.Vector3(0, 0, -1);
                    direction.applyQuaternion(playerShip.mesh.quaternion);
                    const missile = new NuclearMissile(playerShip.mesh.position.clone(), direction, playerShip);
                    missiles.push(missile);
                    showNotification('☢️ NUCLEAR MISSILE LAUNCHED!', 'powerup');
                    playSound('missile');

                    // Cooldown
                    setTimeout(() => {
                        playerShip.nuclearReady = true;
                        document.getElementById('specialReady').textContent = 'ARMED';
                        document.getElementById('specialReady').classList.add('special-ready');
                    }, 10000);

                    document.getElementById('specialReady').textContent = '10s';
                    document.getElementById('specialReady').classList.remove('special-ready');
                }
                e.preventDefault();
                break;
        }
    });

    document.addEventListener('keyup', (e) => {
        if (!playerShip || !playerShip.alive) return;

        switch(e.key.toLowerCase()) {
            case 'arrowup': playerShip.keys.up = false; break;
            case 'arrowdown': playerShip.keys.down = false; break;
            case 'arrowleft': playerShip.keys.left = false; break;
            case 'arrowright': playerShip.keys.right = false; break;
            case ' ': playerShip.keys.fire = false; break;
            case 'shift': playerShip.keys.boost = false; break;
        }
    });

    // Prevent right-click menu
    document.addEventListener('contextmenu', (e) => {
        if (gameState === 'battle') {
            e.preventDefault();
        }
    });
}

// Main Animation Loop
function animate() {
    requestAnimationFrame(animate);

    const time = Date.now() * 0.0001;

    // Update camera
    updateCamera(time);

    // Update game objects if battle is active
    if (gameState === 'battle') {
        // Update ships
        ships.forEach(ship => ship.update());

        // Update projectiles
        lasers = lasers.filter(laser => laser.update());
        missiles = missiles.filter(missile => missile.update());

        // Update powerups
        powerups = powerups.filter(powerup => powerup.update());

        // Update particles
        updateParticles();
    }

    // Render scene
    renderer.render(scene, camera);
}

// Camera System
function updateCamera(time) {
    if (gameMode === 'player' && playerShip && playerShip.alive) {
        // Follow camera
        const offset = new THREE.Vector3(0, 50, 150);
        offset.applyQuaternion(playerShip.mesh.quaternion);

        const targetPos = playerShip.mesh.position.clone().add(offset);
        camera.position.lerp(targetPos, 0.1);

        const lookOffset = new THREE.Vector3(0, 0, -200);
        lookOffset.applyQuaternion(playerShip.mesh.quaternion);
        const lookTarget = playerShip.mesh.position.clone().add(lookOffset);

        camera.lookAt(lookTarget);

    } else if (gameMode === 'mixed' && playerShip && playerShip.alive) {
        // Third-person camera
        const distance = 180;
        const height = 80;

        const offset = new THREE.Vector3(
            Math.sin(playerShip.mesh.rotation.y) * distance,
            height,
            Math.cos(playerShip.mesh.rotation.y) * distance
        );

        const targetPos = playerShip.mesh.position.clone().add(offset);
        camera.position.lerp(targetPos, 0.08);
        camera.lookAt(playerShip.mesh.position);

    } else {
        // Cinematic camera
        const radius = 600 + Math.sin(time * 0.5) * 200;
        camera.position.x = Math.cos(time) * radius;
        camera.position.z = Math.sin(time) * radius;
        camera.position.y = 300 + Math.sin(time * 2) * 100;

        // Look at center of action
        if (ships.length > 0) {
            const avgPos = new THREE.Vector3();
            let count = 0;

            ships.forEach(ship => {
                if (ship.alive) {
                    avgPos.add(ship.mesh.position);
                    count++;
                }
            });

            if (count > 0) {
                avgPos.divideScalar(count);
                camera.lookAt(avgPos);
            }
        } else {
            camera.lookAt(0, 100, 0);
        }
    }
}

// Handle window resize
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// Prevent scrolling with arrow keys
window.addEventListener('keydown', (e) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) {
        e.preventDefault();
    }
});

// Initialize the game
init();

}); // End of window load event