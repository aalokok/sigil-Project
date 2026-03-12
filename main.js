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

        // Controls
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.isInteracting = false;

        this.controls.addEventListener('start', () => { this.isInteracting = true; });
        this.controls.addEventListener('end', () => { this.isInteracting = false; });

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
        // Scene rotation variables
        this.rotationSpeedX = (Math.random() - 0.5) * 0.2;
        this.rotationSpeedY = (Math.random() - 0.5) * 0.2;
        this.rotationSpeedZ = (Math.random() - 0.5) * 0.2;
        this.targetRotationSpeedX = this.rotationSpeedX;
        this.targetRotationSpeedY = this.rotationSpeedY;
        this.targetRotationSpeedZ = this.rotationSpeedZ;
        this.currentRotationMultiplier = 1.0;
        this.targetRotationMultiplier = 1.0;
        this.lastBeatRotationUpdate = 0;
        this.ROTATION_RAMP_SPEED = 1.8;
        this.ROTATION_SPEED_LERP = 1.2;
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

    updateRotation(audioFeatures, delta, currentTime) {
        if (this.audioManager.isAudioSetup && (this.audioManager.isMicActive || (window.audioPlayer && !window.audioPlayer.paused))) {
            // Update target rotation speeds on beats
            if (audioFeatures.beat) {
                if (currentTime - this.lastBeatRotationUpdate > 1.5) {
                    this.targetRotationSpeedX = (Math.random() - 0.5) * 0.3;
                    this.targetRotationSpeedY = (Math.random() - 0.5) * 0.3;
                    this.targetRotationSpeedZ = (Math.random() - 0.5) * 0.3;
                    this.lastBeatRotationUpdate = currentTime;
                    console.log(`Beat: New target speeds X:${this.targetRotationSpeedX.toFixed(3)}, Y:${this.targetRotationSpeedY.toFixed(3)}, Z:${this.targetRotationSpeedZ.toFixed(3)}`);
                }
                this.targetRotationMultiplier = 2.0 + (audioFeatures.bass * 1.0);
            } else {
                this.targetRotationMultiplier = 1.2 + (audioFeatures.overallVolume * 0.8);
            }
            
            // Gradually transition current rotation speeds to targets
            this.rotationSpeedX = THREE.MathUtils.lerp(this.rotationSpeedX, this.targetRotationSpeedX, delta * this.ROTATION_SPEED_LERP);
            this.rotationSpeedY = THREE.MathUtils.lerp(this.rotationSpeedY, this.targetRotationSpeedY, delta * this.ROTATION_SPEED_LERP);
            this.rotationSpeedZ = THREE.MathUtils.lerp(this.rotationSpeedZ, this.targetRotationSpeedZ, delta * this.ROTATION_SPEED_LERP);
            
            // Smooth rotation multiplier changes
            this.currentRotationMultiplier = THREE.MathUtils.lerp(this.currentRotationMultiplier, this.targetRotationMultiplier, delta * this.ROTATION_RAMP_SPEED);
            
            // Apply smooth rotation to all 3 axes
            this.scene.rotation.x += this.rotationSpeedX * this.currentRotationMultiplier * delta;
            this.scene.rotation.y += this.rotationSpeedY * this.currentRotationMultiplier * delta;
            this.scene.rotation.z += this.rotationSpeedZ * this.currentRotationMultiplier * delta;
            
        } else {
            // No audio: gradually slow everything down to stop
            this.targetRotationSpeedX = THREE.MathUtils.lerp(this.targetRotationSpeedX, 0, delta * this.ROTATION_SPEED_LERP);
            this.targetRotationSpeedY = THREE.MathUtils.lerp(this.targetRotationSpeedY, 0, delta * this.ROTATION_SPEED_LERP);
            this.targetRotationSpeedZ = THREE.MathUtils.lerp(this.targetRotationSpeedZ, 0, delta * this.ROTATION_SPEED_LERP);
            
            this.rotationSpeedX = THREE.MathUtils.lerp(this.rotationSpeedX, this.targetRotationSpeedX, delta * this.ROTATION_SPEED_LERP);
            this.rotationSpeedY = THREE.MathUtils.lerp(this.rotationSpeedY, this.targetRotationSpeedY, delta * this.ROTATION_SPEED_LERP);
            this.rotationSpeedZ = THREE.MathUtils.lerp(this.rotationSpeedZ, this.targetRotationSpeedZ, delta * this.ROTATION_SPEED_LERP);
            
            this.currentRotationMultiplier = THREE.MathUtils.lerp(this.currentRotationMultiplier, 0, delta * this.ROTATION_RAMP_SPEED);
            
            this.scene.rotation.x += this.rotationSpeedX * this.currentRotationMultiplier * delta;
            this.scene.rotation.y += this.rotationSpeedY * this.currentRotationMultiplier * delta;
            this.scene.rotation.z += this.rotationSpeedZ * this.currentRotationMultiplier * delta;
        }
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

            // Update rotation
            this.updateRotation(audioFeatures, delta, currentTime);

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