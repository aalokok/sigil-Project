// Main application logic and Three.js setup
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ThresholdShader } from './ThresholdShader.js';
import { ColorInversionManager } from './ColorInvertShader.js';
import { Cybersigil } from './Cybersigil.js';
import { AudioManager } from './audio.js';
import { UIManager } from './ui.js';

class CybersigilApp {
    constructor() {
        this.initializeThreeJS();
        this.initializePostProcessing();
        this.initializeAudio();
        this.initializeSigils();
        this.initializeRotation();
        this.initializeBackground();
        this.initializeUI();
        this.startRenderLoop();
    }

    initializeThreeJS() {
        // Scene setup
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x000000);
        
        this.camera = new THREE.PerspectiveCamera(55, innerWidth/innerHeight, .1, 1000);
        this.camera.position.set(0, 14, 90);

        this.renderer = new THREE.WebGLRenderer({antialias:true, alpha: true});
        this.renderer.setClearAlpha(0.0);
        this.renderer.setPixelRatio(Math.min(devicePixelRatio,2));
        this.renderer.setSize(innerWidth, innerHeight);
        document.body.appendChild(this.renderer.domElement);

        // Controls - target the sigil center
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.target.set(0, 0, -10); // Where sigils are centered
        this.isInteracting = false;
        this.interactionTimeout = null;

        this.controls.addEventListener('start', () => { 
            this.isInteracting = true;
            // Clear any existing timeout
            if (this.interactionTimeout) clearTimeout(this.interactionTimeout);
        });
        this.controls.addEventListener('end', () => { 
            // Delay before audio-reactive camera takes back control
            this.interactionTimeout = setTimeout(() => {
                this.isInteracting = false;
                // Sync our orbit system to current camera position
                this.syncOrbitFromCamera();
            }, 1500);
        });

        // Lighting
        this.scene.add(new THREE.HemisphereLight(0xffffff,0x444444,.9));
        const dir = new THREE.DirectionalLight(0xffffff,1.1); 
        dir.position.set(6,12,8); 
        this.scene.add(dir);

        // Environment
        const pmrem = new THREE.PMREMGenerator(this.renderer);
        this.scene.environment = pmrem.fromScene(new THREE.Scene(),.04).texture;

        // Clock
        this.clock = new THREE.Clock();
    }

    initializePostProcessing() {
        this.composer = new EffectComposer(this.renderer);
        const renderPass = new RenderPass(this.scene, this.camera);
        this.composer.addPass(renderPass);

        // Bloom Pass
        this.bloomPass = new UnrealBloomPass(
            new THREE.Vector2(innerWidth, innerHeight),
            1.5,    // strength
            0.4,    // radius
            0.85    // threshold
        );
        this.composer.addPass(this.bloomPass);

        // Threshold Pass
        this.thresholdPass = new ShaderPass(ThresholdShader);
        if (this.thresholdPass) this.thresholdPass.uniforms.uInverseThreshold.value = true;
        this.composer.addPass(this.thresholdPass);

        // Noise Shader
        const NoiseShader = {
            uniforms: {
                'tDiffuse': { value: null },
                'uTime': { value: 0.0 },
                'uNoiseAmount': { value: 0.1 }
            },
            vertexShader: `
                varying vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform sampler2D tDiffuse;
                uniform float uTime;
                uniform float uNoiseAmount;
                varying vec2 vUv;

                float random(vec2 st) {
                    return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
                }

                void main() {
                    vec4 diffuseColor = texture2D(tDiffuse, vUv);
                    float noise = (random(vUv + mod(uTime * 0.1, 100.0)) - 0.5) * uNoiseAmount;
                    diffuseColor.rgb += noise;
                    gl_FragColor = diffuseColor;
                }
            `
        };
        this.noisePass = new ShaderPass(NoiseShader);
        this.composer.addPass(this.noisePass);

        const outputPass = new OutputPass();
        this.composer.addPass(outputPass);

        // Initialize Color Inversion Manager immediately (no setTimeout)
        this.colorInversionManager = new ColorInversionManager(this.composer);
        console.log('Color inversion manager initialized');
    }

    initializeAudio() {
        this.audioManager = new AudioManager();
    }

    initializeSigils() {
        this.allSigils = [];
        this.sigilManager = {
            handleSpaceKey: (mirrorX, mirrorY, mirrorZ) => {
                if (this.allSigils.length === 0) {
                    console.log("Space: No sigils exist, resetting.");
                    this.resetSigil(mirrorX, mirrorY, mirrorZ);
                    return;
                }
                const targetSigil = this.allSigils[0];
                
                if (!targetSigil) {
                    console.error("Space: No primary sigil instance found after check. Resetting.");
                    this.resetSigil(mirrorX, mirrorY, mirrorZ);
                    return;
                }

                targetSigil.spawnNewBranch(mirrorX, mirrorY, mirrorZ);
            },
            
            resetSigil: (mirrorX, mirrorY, mirrorZ) => {
                this.resetSigil(mirrorX, mirrorY, mirrorZ);
            },
            
            handleVocalSpawn: (mirrorX, mirrorY, mirrorZ) => {
                if (this.allSigils.length === 0) {
                    console.log("Vocal: No sigils exist. Initializing sigils now.");
                    this.resetSigil(mirrorX, mirrorY, mirrorZ);
                } else {
                    const targetSigil = this.allSigils[0];
                    if (targetSigil) {
                        targetSigil.spawnNewBranch(mirrorX, mirrorY, mirrorZ);
                        console.log("Vocal: Spawned new branch on existing sigil.");
                    } else {
                        console.error("Vocal: Sigil array populated, but targetSigil is undefined. Resetting as a fallback.");
                        this.resetSigil(mirrorX, mirrorY, mirrorZ);
                    }
                }
            }
        };
    }

    initializeRotation() {
        // Camera orbit system - keeps sigil in focus while camera moves around it
        this.cameraOrbitAngleX = 0;      // Vertical orbit angle (pitch)
        this.cameraOrbitAngleY = 0;      // Horizontal orbit angle (yaw)
        this.cameraOrbitRadius = 90;     // Distance from center
        this.cameraLookTarget = new THREE.Vector3(0, 0, -10); // Where sigils are centered
        
        // Target values for smooth interpolation
        this.targetOrbitAngleX = 0;
        this.targetOrbitAngleY = 0;
        this.targetOrbitRadius = 90;
        
        // Orbit velocity (for continuous movement)
        this.orbitVelocityX = (Math.random() - 0.5) * 0.3;
        this.orbitVelocityY = (Math.random() - 0.5) * 0.3;
        this.targetOrbitVelocityX = this.orbitVelocityX;
        this.targetOrbitVelocityY = this.orbitVelocityY;
        
        // Camera limits
        this.MIN_ORBIT_RADIUS = 40;
        this.MAX_ORBIT_RADIUS = 140;
        this.MAX_ORBIT_ANGLE_X = Math.PI / 3;  // Limit vertical angle to avoid going under/over
        
        // Dynamics
        this.ORBIT_LERP_SPEED = 3.0;
        this.VELOCITY_LERP_SPEED = 2.5;
        this.ZOOM_LERP_SPEED = 4.0;
        this.BEAT_DIRECTION_COOLDOWN = 0.5;
        this.lastBeatOrbitUpdate = 0;
        
        // Instant punch for responsiveness
        this.orbitPunchX = 0;
        this.orbitPunchY = 0;
        this.zoomPunch = 0;
        this.PUNCH_DECAY = 10.0;
    }

    syncOrbitFromCamera() {
        // Calculate orbit angles from current camera position
        const offset = new THREE.Vector3().subVectors(this.camera.position, this.cameraLookTarget);
        this.cameraOrbitRadius = offset.length();
        this.targetOrbitRadius = this.cameraOrbitRadius;
        
        // Calculate angles
        this.cameraOrbitAngleY = Math.atan2(offset.x, offset.z);
        this.cameraOrbitAngleX = Math.asin(THREE.MathUtils.clamp(offset.y / this.cameraOrbitRadius, -1, 1));
        
        this.targetOrbitAngleX = this.cameraOrbitAngleX;
        this.targetOrbitAngleY = this.cameraOrbitAngleY;
        
        // Reset velocities
        this.orbitVelocityX = 0;
        this.orbitVelocityY = 0;
        this.targetOrbitVelocityX = (Math.random() - 0.5) * 0.2;
        this.targetOrbitVelocityY = (Math.random() - 0.5) * 0.2;
    }

    initializeBackground() {
        // Background flash variables
        this.currentBackgroundColor = new THREE.Color(0x000000);
        this.targetBackgroundColor = new THREE.Color(0x000000);
        this.FLASH_DECAY_SPEED = 8.0;
        this.FLASH_HOLD_TIME = 0.08;
        this.flashHoldTimer = 0;
    }

    initializeUI() {
        this.uiManager = new UIManager(this.audioManager, this.sigilManager, this.colorInversionManager);
        this.setupEffectControls();
    }

    setupEffectControls() {
        const controls = this.uiManager.effectControls;

        // Noise amount slider
        controls.noiseAmount.addEventListener('input', (event) => {
            // Will be handled in render loop
        });

        // Bloom controls
        controls.bloomStrength.addEventListener('input', (event) => {
            // Will be handled in render loop
        });

        controls.bloomRadius.addEventListener('input', (event) => {
            if (this.bloomPass) this.bloomPass.radius = parseFloat(event.target.value);
        });

        controls.bloomThreshold.addEventListener('input', (event) => {
            if (this.bloomPass) this.bloomPass.threshold = parseFloat(event.target.value);
        });

        // Threshold controls
        controls.thresholdStrength.addEventListener('input', (event) => {
            // Will be handled in render loop
        });

        controls.inverseThreshold.addEventListener('change', (event) => {
            if (this.thresholdPass) this.thresholdPass.uniforms.uInverseThreshold.value = event.target.checked;
        });

        // Image upload
        controls.imageUpload.addEventListener('change', (event) => {
            const file = event.target.files[0];
            if (file && this.thresholdPass) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    // Set CSS background
                    document.getElementById('background-container').style.backgroundImage = `url(${e.target.result})`;

                    // Load as texture for thresholding
                    const img = new Image();
                    img.onload = () => {
                        const texture = new THREE.Texture(img);
                        texture.needsUpdate = true;
                        if (this.thresholdPass && this.thresholdPass.uniforms.tThresholdMap) {
                            this.thresholdPass.uniforms.tThresholdMap.value = texture;
                            console.log("Threshold image texture updated for sigil effect.");
                        }
                    };
                    img.src = e.target.result;
                };
                reader.readAsDataURL(file);
            }
        });
    }

    resetSigil(mirrorX, mirrorY, mirrorZ) {
        this.allSigils.forEach(sigilInstance => {
            sigilInstance.dispose();
        });
        this.allSigils.length = 0;

        const rootInitialGroupPos = new THREE.Vector3(0,0,-10);
        const primaryRootDir = new THREE.Vector3(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1).normalize();
        if (primaryRootDir.lengthSq() === 0) primaryRootDir.set(0,0,1);
        const primaryRootSeed = Math.random() * 1000;
        
        const newSigil = new Cybersigil(this.scene, rootInitialGroupPos, primaryRootDir, primaryRootSeed, mirrorX, mirrorY, mirrorZ);
        this.allSigils.push(newSigil);
        console.log(`RESETsigil: Created new Cybersigil. Total sigils: ${this.allSigils.length}, Position: ${rootInitialGroupPos.x.toFixed(1)}, ${rootInitialGroupPos.y.toFixed(1)}, ${rootInitialGroupPos.z.toFixed(1)}`);
    }

    updateCameraMovement(audioFeatures, delta, currentTime) {
        // Skip audio-reactive camera when user is interacting with OrbitControls
        if (this.isInteracting) return;
        
        if (this.audioManager.isAudioSetup && (this.audioManager.isMicActive || (window.audioPlayer && !window.audioPlayer.paused))) {
            // On beats: change orbit direction and add zoom punch
            if (audioFeatures.beat) {
                if (currentTime - this.lastBeatOrbitUpdate > this.BEAT_DIRECTION_COOLDOWN) {
                    // New random orbit velocities
                    this.targetOrbitVelocityX = (Math.random() - 0.5) * 0.6;
                    this.targetOrbitVelocityY = (Math.random() - 0.5) * 0.8;
                    this.lastBeatOrbitUpdate = currentTime;
                }
                
                // Instant punch on every beat
                const punchIntensity = 0.04 + audioFeatures.bass * 0.06;
                this.orbitPunchX = (Math.random() - 0.5) * punchIntensity;
                this.orbitPunchY = (Math.random() - 0.5) * punchIntensity;
                
                // Zoom punch - push in on beat
                this.zoomPunch = -15 * (0.5 + audioFeatures.bass * 0.5);
            }
            
            // Snare hits: add extra orbit punch
            if (audioFeatures.snareHit) {
                this.orbitPunchX += (Math.random() - 0.5) * 0.03;
                this.orbitPunchY += (Math.random() - 0.5) * 0.03;
                this.zoomPunch -= 8;
            }
            
            // Audio-reactive zoom target (bass pulls in, quiet pushes out)
            const audioZoom = 90 - (audioFeatures.bass * 30) + (audioFeatures.overallVolume * -10);
            this.targetOrbitRadius = THREE.MathUtils.clamp(audioZoom, this.MIN_ORBIT_RADIUS, this.MAX_ORBIT_RADIUS);
            
            // Velocity influenced by audio intensity
            const intensityMultiplier = 1.0 + audioFeatures.overallVolume * 1.5 + audioFeatures.mid * 0.8;
            
            // Smooth velocity transitions
            this.orbitVelocityX = THREE.MathUtils.lerp(this.orbitVelocityX, this.targetOrbitVelocityX * intensityMultiplier, delta * this.VELOCITY_LERP_SPEED);
            this.orbitVelocityY = THREE.MathUtils.lerp(this.orbitVelocityY, this.targetOrbitVelocityY * intensityMultiplier, delta * this.VELOCITY_LERP_SPEED);
            
            // Update orbit angles
            this.targetOrbitAngleX += this.orbitVelocityX * delta;
            this.targetOrbitAngleY += this.orbitVelocityY * delta;
            
            // Clamp vertical angle to prevent flipping
            this.targetOrbitAngleX = THREE.MathUtils.clamp(this.targetOrbitAngleX, -this.MAX_ORBIT_ANGLE_X, this.MAX_ORBIT_ANGLE_X);
            
        } else {
            // No audio: gradually slow down and return to default position
            this.targetOrbitVelocityX = THREE.MathUtils.lerp(this.targetOrbitVelocityX, 0, delta * this.VELOCITY_LERP_SPEED);
            this.targetOrbitVelocityY = THREE.MathUtils.lerp(this.targetOrbitVelocityY, 0, delta * this.VELOCITY_LERP_SPEED);
            this.orbitVelocityX = THREE.MathUtils.lerp(this.orbitVelocityX, 0, delta * this.VELOCITY_LERP_SPEED);
            this.orbitVelocityY = THREE.MathUtils.lerp(this.orbitVelocityY, 0, delta * this.VELOCITY_LERP_SPEED);
            this.targetOrbitRadius = THREE.MathUtils.lerp(this.targetOrbitRadius, 90, delta * this.ZOOM_LERP_SPEED * 0.5);
        }
        
        // Decay punches
        this.orbitPunchX = THREE.MathUtils.lerp(this.orbitPunchX, 0, delta * this.PUNCH_DECAY);
        this.orbitPunchY = THREE.MathUtils.lerp(this.orbitPunchY, 0, delta * this.PUNCH_DECAY);
        this.zoomPunch = THREE.MathUtils.lerp(this.zoomPunch, 0, delta * this.PUNCH_DECAY);
        
        // Smooth interpolation to target angles
        this.cameraOrbitAngleX = THREE.MathUtils.lerp(this.cameraOrbitAngleX, this.targetOrbitAngleX + this.orbitPunchX, delta * this.ORBIT_LERP_SPEED);
        this.cameraOrbitAngleY = THREE.MathUtils.lerp(this.cameraOrbitAngleY, this.targetOrbitAngleY + this.orbitPunchY, delta * this.ORBIT_LERP_SPEED);
        this.cameraOrbitRadius = THREE.MathUtils.lerp(this.cameraOrbitRadius, this.targetOrbitRadius + this.zoomPunch, delta * this.ZOOM_LERP_SPEED);
        
        // Clamp radius
        this.cameraOrbitRadius = THREE.MathUtils.clamp(this.cameraOrbitRadius, this.MIN_ORBIT_RADIUS, this.MAX_ORBIT_RADIUS);
        
        // Calculate camera position on sphere around target
        const x = this.cameraLookTarget.x + this.cameraOrbitRadius * Math.sin(this.cameraOrbitAngleY) * Math.cos(this.cameraOrbitAngleX);
        const y = this.cameraLookTarget.y + this.cameraOrbitRadius * Math.sin(this.cameraOrbitAngleX);
        const z = this.cameraLookTarget.z + this.cameraOrbitRadius * Math.cos(this.cameraOrbitAngleY) * Math.cos(this.cameraOrbitAngleX);
        
        // Apply camera position and look at sigil center
        this.camera.position.set(x, y, z);
        this.camera.lookAt(this.cameraLookTarget);
    }

    updatePostProcessing(audioFeatures) {
        const controls = this.uiManager.effectControls;
        
        if (this.audioManager.isAudioSetup && (this.audioManager.isMicActive || (window.audioPlayer && !window.audioPlayer.paused))) {
            // Snare-reactive noise effect
            if (this.noisePass && this.noisePass.uniforms.uNoiseAmount) {
                const baseNoise = parseFloat(controls.noiseAmount.value);
                const snareBoost = audioFeatures.snareHit ? 0.15 : 0;
                this.noisePass.uniforms.uNoiseAmount.value = baseNoise + snareBoost;
            }
            
            // Snare-reactive bloom effect
            if (this.bloomPass) {
                const baseStrength = parseFloat(controls.bloomStrength.value);
                const snareBloomBoost = audioFeatures.snareHit ? 0.8 : 0;
                this.bloomPass.strength = baseStrength + snareBloomBoost;
            }
            
            // Vocal-reactive threshold pass
            if (this.thresholdPass && this.thresholdPass.uniforms.uThresholdStrength) {
                const baseThreshold = parseFloat(controls.thresholdStrength.value);
                const vocalMod = audioFeatures.vocals * 0.25;
                this.thresholdPass.uniforms.uThresholdStrength.value = THREE.MathUtils.clamp(baseThreshold + vocalMod - 0.125, 0.1, 0.9);
            }
        }
    }

    updateBackgroundFlash(audioFeatures, delta) {
        if (this.audioManager.isAudioSetup && (this.audioManager.isMicActive || (window.audioPlayer && !window.audioPlayer.paused))) {
            if (audioFeatures.beat) {
                const flashColors = [
                    new THREE.Color(0.7, 0.7, 0.7),
                ];
                this.targetBackgroundColor.copy(flashColors[Math.floor(Math.random() * flashColors.length)]);
                this.currentBackgroundColor.copy(this.targetBackgroundColor);
                this.scene.background = this.currentBackgroundColor;
                this.flashHoldTimer = this.FLASH_HOLD_TIME;
                console.log("Beat flash triggered");
            } else {
                if (this.flashHoldTimer > 0) {
                    this.flashHoldTimer -= delta;
                    this.scene.background = this.currentBackgroundColor;
                } else {
                    const restingColor = new THREE.Color(0x000000);
                    this.currentBackgroundColor.lerp(restingColor, delta * this.FLASH_DECAY_SPEED);
                    this.scene.background = this.currentBackgroundColor;
                }
            }
        } else {
            const restingColor = new THREE.Color(0x000000);
            if (this.flashHoldTimer > 0) {
                this.flashHoldTimer -= delta;
                this.scene.background = this.currentBackgroundColor;
            } else {
                if (!this.currentBackgroundColor.equals(restingColor)) {
                    this.currentBackgroundColor.lerp(restingColor, delta * this.FLASH_DECAY_SPEED);
                } else {
                    this.currentBackgroundColor.copy(restingColor);
                }
                this.scene.background = this.currentBackgroundColor;
            }
        }
    }

    startRenderLoop() {
        const animate = () => {
            requestAnimationFrame(animate);
            const delta = this.clock.getDelta();
            const currentTime = this.clock.getElapsedTime();

            // Analyze audio
            const audioFeatures = this.audioManager.analyzeAudio(currentTime);

            // Handle vocal detection
            if (audioFeatures.vocal) {
                this.uiManager.handleVocalDetection();
            }

            // Fallback: Auto-create sigil if none exist and audio is playing for 3+ seconds
            if (this.allSigils.length === 0 && currentTime > 3.0) {
                console.log("Auto-fallback: Creating initial sigil after 3 seconds of audio");
                const mirrorStates = this.uiManager.mirrorStates;
                this.resetSigil(mirrorStates.x, mirrorStates.y, mirrorStates.z);
            }

            // Update sigils
            for(const sigilInstance of this.allSigils) {
                sigilInstance.update(delta, this.isInteracting, audioFeatures);
            }

            // Update camera movement (orbit around sigil)
            this.updateCameraMovement(audioFeatures, delta, currentTime);

            // Update post-processing
            this.updatePostProcessing(audioFeatures);

            // Update background flash
            this.updateBackgroundFlash(audioFeatures, delta);

            // Update shader uniforms
            if (this.noisePass) this.noisePass.uniforms.uTime.value += delta * 5.0;
            if (this.thresholdPass) this.thresholdPass.uniforms.uTime.value += delta;

            this.controls.update();
            this.composer.render(delta);
        };
        animate();

        // Resize handler
        addEventListener('resize', () => {
            this.camera.aspect = innerWidth/innerHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(innerWidth, innerHeight);
            this.composer.setSize(innerWidth, innerHeight);
            if (this.bloomPass) {
                this.bloomPass.resolution.set(innerWidth, innerHeight);
            }
        });
    }
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new CybersigilApp();
}); 