// UI controls and interactions module
export class UIManager {
    constructor(audioManager, sigilManager, colorInversionManager) {
        this.audioManager = audioManager;
        this.sigilManager = sigilManager;
        this.colorInversionManager = colorInversionManager;
        
        // Mirror states
        this.mirrorXActive = true;
        this.mirrorYActive = false;
        this.mirrorZActive = false;
        
        this.effectsPanelOpen = true;
        this.setupEventListeners();
    }

    setupEventListeners() {
        this.setupEffectsPanel();
        this.setupMirrorControls();
        this.setupAudioControls();
        this.setupEffectControls();
        this.setupKeyboardControls();
    }

    setupEffectsPanel() {
        const effectsHeader = document.getElementById('effects-header');
        const effectsContent = document.getElementById('effects-content');
        const effectsToggle = document.getElementById('effects-toggle');

        effectsHeader.addEventListener('click', () => {
            this.effectsPanelOpen = !this.effectsPanelOpen;
            if (this.effectsPanelOpen) {
                effectsContent.classList.remove('collapsed');
                effectsToggle.textContent = '▲';
            } else {
                effectsContent.classList.add('collapsed');
                effectsToggle.textContent = '▼';
            }
        });
    }

    setupMirrorControls() {
        const mirrorXBtn = document.getElementById('mirrorXBtn');
        const mirrorYBtn = document.getElementById('mirrorYBtn');
        const mirrorZBtn = document.getElementById('mirrorZBtn');
        const invertColorsBtn = document.getElementById('invertColorsBtn');

        this.setupMirrorButton(mirrorXBtn, 'mirrorXActive', 'X');
        this.setupMirrorButton(mirrorYBtn, 'mirrorYActive', 'Y');
        this.setupMirrorButton(mirrorZBtn, 'mirrorZActive', 'Z');

        // Color inversion button
        invertColorsBtn.addEventListener('click', () => {
            if (this.colorInversionManager) {
                const isInverted = this.colorInversionManager.toggleInversion();
                if (isInverted) {
                    invertColorsBtn.classList.add('active');
                } else {
                    invertColorsBtn.classList.remove('active');
                }
            } else {
                console.warn('Color inversion manager not yet initialized');
            }
        });
    }

    setupMirrorButton(button, stateVarName, axisLabel) {
        // Set initial state
        button.textContent = axisLabel;
        if (this[stateVarName]) {
            button.classList.add('active');
        } else {
            button.classList.remove('active');
        }

        button.addEventListener('click', () => {
            this[stateVarName] = !this[stateVarName];
            
            if (this[stateVarName]) {
                button.classList.add('active');
            } else {
                button.classList.remove('active');
            }
            console.log(`Mirror ${axisLabel} Active:`, this[stateVarName]);
        });
    }

    setupAudioControls() {
        const micToggleBtn = document.getElementById('micToggle');
        const audioUploadInput = document.getElementById('audioUpload');
        const audioPlayer = document.getElementById('audioPlayer');

        // Microphone toggle
        micToggleBtn.addEventListener('click', () => {
            if (this.audioManager.isMicActive) {
                this.audioManager.stopMicrophone();
                micToggleBtn.textContent = '🎤 Microphone';
                micToggleBtn.classList.remove('active');
                
                // Reconnect file audio if available
                if (this.audioManager.audioSourceNode && audioPlayer.src) {
                    try {
                        this.audioManager.audioSourceNode.disconnect();
                        this.audioManager.audioSourceNode.connect(this.audioManager.analyserNode);
                        this.audioManager.analyserNode.connect(this.audioManager.audioContext.destination);
                        console.log("Reconnected file audio for playback");
                    } catch (e) {
                        console.warn("Error reconnecting file audio:", e);
                    }
                }
            } else {
                // Disconnect file audio first
                if (this.audioManager.audioSourceNode) {
                    try {
                        this.audioManager.audioSourceNode.disconnect();
                    } catch (e) {
                        // Ignore disconnect errors
                    }
                }
                if (this.audioManager.analyserNode) {
                    try {
                        this.audioManager.analyserNode.disconnect();
                    } catch (e) {
                        // Ignore disconnect errors
                    }
                }
                
                this.audioManager.setupMicrophone();
                micToggleBtn.textContent = '🎤 Microphone';
                micToggleBtn.classList.add('active');
            }
            this.audioManager.isMicActive = !this.audioManager.isMicActive;
        });

        // Audio file upload
        audioUploadInput.addEventListener('change', (event) => {
            const file = event.target.files[0];
            if (file) {
                console.log("New audio file selected, performing full reset...");
                
                this.audioManager.fullReset();
                
                const reader = new FileReader();
                reader.onload = (e) => {
                    const newAudioPlayer = this.createNewAudioElement(e.target.result);
                    console.log("New audio element created with src");
                    
                    const setupWhenReady = () => {
                        if (newAudioPlayer.readyState >= 2) {
                            console.log("Audio ready, setting up processing...");
                            setTimeout(() => {
                                this.audioManager.setupAudioProcessing();
                            }, 100);
                        }
                    };
                    
                    newAudioPlayer.oncanplaythrough = setupWhenReady;
                    newAudioPlayer.onloadeddata = setupWhenReady;
                    
                    this.addAudioEventListeners(newAudioPlayer);
                };
                reader.readAsDataURL(file);
            }
        });
    }

    createNewAudioElement(src) {
        console.log("Creating new audio element...");
        
        const oldAudio = document.getElementById('audioPlayer');
        if (oldAudio) {
            oldAudio.remove();
        }
        
        const newAudio = document.createElement('audio');
        newAudio.id = 'audioPlayer';
        newAudio.controls = true;
        newAudio.loop = true;
        newAudio.src = src;
        
        const audioControls = document.getElementById('audio-controls');
        audioControls.appendChild(newAudio);
        
        window.audioPlayer = newAudio;
        return newAudio;
    }

    addAudioEventListeners(audioPlayer) {
        audioPlayer.addEventListener('seeked', () => {
            console.log("Audio seeked, resetting beat timing...");
            this.audioManager.lastBeatTime = 0;
        });

        audioPlayer.addEventListener('ended', () => {
            console.log("Audio ended, resetting for potential loop...");
            this.audioManager.lastBeatTime = 0;
        });

        audioPlayer.addEventListener('play', () => {
            console.log("Audio play event...");
            if (this.audioManager.audioContext && this.audioManager.audioContext.state === 'suspended') {
                console.log("Resuming suspended audio context...");
                this.audioManager.audioContext.resume().then(() => {
                    console.log("Audio context resumed successfully");
                });
            }
            
            if (!this.audioManager.isAudioSetup && audioPlayer.src && audioPlayer.readyState >= 2) {
                console.log("Setting up audio processing on play...");
                this.audioManager.setupAudioProcessing();
            }
        });

        audioPlayer.addEventListener('error', (e) => {
            console.error("Audio error:", e);
            this.audioManager.fullReset();
        });
    }

    setupEffectControls() {
        // Get all the effect control elements
        const micGainSlider = document.getElementById('micGain');
        const noiseAmountSlider = document.getElementById('noiseAmount');
        const bloomStrengthSlider = document.getElementById('bloomStrength');
        const bloomRadiusSlider = document.getElementById('bloomRadius');
        const bloomThresholdSlider = document.getElementById('bloomThreshold');
        const thresholdStrengthSlider = document.getElementById('thresholdStrength');
        const inverseThresholdCheckbox = document.getElementById('inverseThreshold');
        const imageUploadInput = document.getElementById('imageUpload');

        // Microphone gain slider
        micGainSlider.addEventListener('input', (event) => {
            this.audioManager.updateMicGain(event.target.value);
        });

        // These will be handled by the main application since they need access to post-processing passes
        // Export the sliders for external access
        this.effectControls = {
            micGain: micGainSlider,
            noiseAmount: noiseAmountSlider,
            bloomStrength: bloomStrengthSlider,
            bloomRadius: bloomRadiusSlider,
            bloomThreshold: bloomThresholdSlider,
            thresholdStrength: thresholdStrengthSlider,
            inverseThreshold: inverseThresholdCheckbox,
            imageUpload: imageUploadInput
        };
    }

    setupKeyboardControls() {
        addEventListener('keydown', e => {
            if (e.code === 'Space') {
                e.preventDefault();
                this.sigilManager.handleSpaceKey(this.mirrorXActive, this.mirrorYActive, this.mirrorZActive);
            } else if (e.code === 'KeyR') {
                e.preventDefault();
                this.sigilManager.resetSigil(this.mirrorXActive, this.mirrorYActive, this.mirrorZActive);
            }
        });
    }

    handleVocalDetection() {
        this.sigilManager.handleVocalSpawn(this.mirrorXActive, this.mirrorYActive, this.mirrorZActive);
    }

    // Getters for mirror states (for external access)
    get mirrorStates() {
        return {
            x: this.mirrorXActive,
            y: this.mirrorYActive,
            z: this.mirrorZActive
        };
    }
} 