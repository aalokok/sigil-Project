// Audio processing and management module
export class AudioManager {
    constructor() {
        // Audio setup variables
        this.audioContext = null;
        this.analyserNode = null;
        this.audioSourceNode = null;
        this.audioDataArray = null;
        this.isAudioSetup = false;
        
        // Audio event timing and thresholds
        this.lastBeatTime = 0;
        this.lastVocalTime = 0;
        this.lastSnareTime = 0;
        this.BEAT_COOLDOWN = 0.3;
        this.VOCAL_COOLDOWN = 0.4;
        this.SNARE_COOLDOWN = 0.2;
        this.BASS_THRESHOLD_BEAT = 0.88;
        this.VOCAL_THRESHOLD = 0.45;
        this.SNARE_THRESHOLD = 0.70;

        // Microphone setup
        this.micStream = null;
        this.micSourceNode = null;
        this.micGainNode = null;
        this.isMicActive = false;
        this.isMicSetup = false;

        // Enhanced frequency band definitions
        this.bassStartIndex = 0;
        this.bassEndIndex = 0;
        this.snareStartIndex = 0;
        this.snareEndIndex = 0;
        this.vocalStartIndex = 0;
        this.vocalEndIndex = 0;
        this.snareHighStartIndex = 0;
        this.snareHighEndIndex = 0;
        this.midStartIndex = 0;
        this.midEndIndex = 0;
        this.trebleStartIndex = 0;
        this.trebleEndIndex = 0;
        
        // BPM Detection
        this.beatHistory = [];
        this.currentBPM = 120;
        this.lastBPMCalculation = 0;
        this.BPM_HISTORY_LENGTH = 16;
    }

    setupAudioProcessing() {
        if (!this.isAudioSetup && window.audioPlayer && window.audioPlayer.src) {
            try {
                this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
                this.analyserNode = this.audioContext.createAnalyser();
                this.analyserNode.fftSize = 1024;
                this.analyserNode.smoothingTimeConstant = 0.75;
                this.audioDataArray = new Uint8Array(this.analyserNode.frequencyBinCount);

                this.calculateFrequencyBands();

                // Always create a fresh media element source
                this.audioSourceNode = this.audioContext.createMediaElementSource(window.audioPlayer);
                this.audioSourceNode.connect(this.analyserNode);
                this.analyserNode.connect(this.audioContext.destination);
                
                this.isAudioSetup = true;
                console.log("File audio processing setup complete - WITH PLAYBACK");
            } catch (error) {
                console.error("Error setting up audio processing:", error);
                this.isAudioSetup = false;
            }
        }
    }

    async setupMicrophone() {
        console.log("Setting up microphone...");
        try {
            this.micStream = await navigator.mediaDevices.getUserMedia({ 
                audio: {
                    echoCancellation: false,
                    noiseSuppression: false,
                    autoGainControl: false
                } 
            });
            
            if (!this.audioContext || this.audioContext.state === 'closed') {
                this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            }
            
            if (this.audioContext.state === 'suspended') {
                await this.audioContext.resume();
            }
            
            if (this.analyserNode) {
                try {
                    this.analyserNode.disconnect();
                } catch (e) {
                    // Ignore disconnect errors
                }
            }
            
            if (!this.analyserNode) {
                this.analyserNode = this.audioContext.createAnalyser();
                this.analyserNode.fftSize = 1024;
                this.analyserNode.smoothingTimeConstant = 0.75;
                this.audioDataArray = new Uint8Array(this.analyserNode.frequencyBinCount);
                
                this.calculateFrequencyBands();
            }
            
            if (this.audioSourceNode) {
                try {
                    this.audioSourceNode.disconnect();
                } catch (e) {
                    // Ignore disconnect errors
                }
            }
            
            this.micSourceNode = this.audioContext.createMediaStreamSource(this.micStream);
            this.micGainNode = this.audioContext.createGain();
            this.micGainNode.gain.value = parseFloat(document.getElementById('micGain').value);
            
            this.micSourceNode.connect(this.micGainNode);
            this.micGainNode.connect(this.analyserNode);
            
            this.isMicSetup = true;
            this.isAudioSetup = true;
            console.log("Microphone setup complete - NO FEEDBACK ROUTING");
            
        } catch (error) {
            console.error("Error setting up microphone:", error);
            alert("Could not access microphone. Please check permissions.");
            this.isMicSetup = false;
            this.isAudioSetup = false;
        }
    }

    stopMicrophone() {
        console.log("Stopping microphone...");
        
        if (this.micSourceNode) {
            try {
                this.micSourceNode.disconnect();
            } catch (e) {
                console.warn("Error disconnecting mic source:", e);
            }
            this.micSourceNode = null;
        }
        
        if (this.micGainNode) {
            try {
                this.micGainNode.disconnect();
            } catch (e) {
                console.warn("Error disconnecting mic gain:", e);
            }
            this.micGainNode = null;
        }
        
        if (this.micStream) {
            this.micStream.getTracks().forEach(track => track.stop());
            this.micStream = null;
        }
        
        this.isMicSetup = false;
        this.isMicActive = false;
        
        if (!window.audioPlayer || window.audioPlayer.paused || !window.audioPlayer.src) {
            this.isAudioSetup = false;
        }
        
        console.log("Microphone stopped");
    }

    calculateFrequencyBands() {
        const nyquist = this.audioContext.sampleRate / 2;
        const freqPerBin = nyquist / this.analyserNode.frequencyBinCount;
        
        this.bassStartIndex = Math.floor(20 / freqPerBin);
        this.bassEndIndex = Math.floor(250 / freqPerBin);
        
        this.snareStartIndex = Math.floor(200 / freqPerBin);
        this.snareEndIndex = Math.floor(500 / freqPerBin);
        
        this.vocalStartIndex = Math.floor(300 / freqPerBin);
        this.vocalEndIndex = Math.floor(3000 / freqPerBin);
        
        this.snareHighStartIndex = Math.floor(5000 / freqPerBin);
        this.snareHighEndIndex = Math.min(Math.floor(10000 / freqPerBin), this.analyserNode.frequencyBinCount - 1);
        
        this.midStartIndex = Math.floor(250 / freqPerBin);
        this.midEndIndex = Math.floor(2000 / freqPerBin);
        
        this.trebleStartIndex = Math.floor(2000 / freqPerBin);
        this.trebleEndIndex = Math.min(Math.floor(10000 / freqPerBin), this.analyserNode.frequencyBinCount - 1);
        
        console.log(`Enhanced Audio Setup: SampleRate=${this.audioContext.sampleRate}, FreqPerBin=${freqPerBin.toFixed(2)}Hz`);
    }

    analyzeAudio(currentTime) {
        const audioFeatures = { 
            bass: 0, mid: 0, treble: 0, vocals: 0, snare: 0, snareHigh: 0,
            beat: false, vocal: false, snareHit: false, 
            overallVolume: 0, bpm: this.currentBPM 
        };

        if (this.isAudioSetup && (this.isMicActive || (window.audioPlayer && !window.audioPlayer.paused))) {
            this.analyserNode.getByteFrequencyData(this.audioDataArray);
            
            let bassSum = 0, midSum = 0, trebleSum = 0, overallSum = 0;
            let vocalSum = 0, snareSum = 0, snareHighSum = 0;
            let bassCount = 0, midCount = 0, trebleCount = 0;
            let vocalCount = 0, snareCount = 0, snareHighCount = 0;

            // Calculate frequency band averages
            for (let i = 0; i < this.audioDataArray.length; i++) {
                overallSum += this.audioDataArray[i];
                
                if (i >= this.bassStartIndex && i <= this.bassEndIndex) {
                    bassSum += this.audioDataArray[i];
                    bassCount++;
                }
                if (i >= this.midStartIndex && i <= this.midEndIndex) {
                    midSum += this.audioDataArray[i];
                    midCount++;
                }
                if (i >= this.trebleStartIndex && i <= this.trebleEndIndex) {
                    trebleSum += this.audioDataArray[i];
                    trebleCount++;
                }
                if (i >= this.vocalStartIndex && i <= this.vocalEndIndex) {
                    vocalSum += this.audioDataArray[i];
                    vocalCount++;
                }
                if (i >= this.snareStartIndex && i <= this.snareEndIndex) {
                    snareSum += this.audioDataArray[i];
                    snareCount++;
                }
                if (i >= this.snareHighStartIndex && i <= this.snareHighEndIndex) {
                    snareHighSum += this.audioDataArray[i];
                    snareHighCount++;
                }
            }

            // Normalize all frequency bands
            audioFeatures.overallVolume = overallSum / this.audioDataArray.length / 255;
            audioFeatures.bass = bassCount > 0 ? (bassSum / bassCount) / 255 : 0;
            audioFeatures.mid = midCount > 0 ? (midSum / midCount) / 255 : 0;
            audioFeatures.treble = trebleCount > 0 ? (trebleSum / trebleCount) / 255 : 0;
            audioFeatures.vocals = vocalCount > 0 ? (vocalSum / vocalCount) / 255 : 0;
            audioFeatures.snare = snareCount > 0 ? (snareSum / snareCount) / 255 : 0;
            audioFeatures.snareHigh = snareHighCount > 0 ? (snareHighSum / snareHighCount) / 255 : 0;

            // Debug audio levels
            if (Math.floor(currentTime * 60) % 60 === 0) {
                console.log(`Audio Levels - Bass: ${audioFeatures.bass.toFixed(2)}, Vocals: ${audioFeatures.vocals.toFixed(2)}, Snare: ${audioFeatures.snare.toFixed(2)}, Overall: ${audioFeatures.overallVolume.toFixed(2)}`);
            }

            // Beat detection
            if (audioFeatures.bass > this.BASS_THRESHOLD_BEAT && (currentTime - this.lastBeatTime > this.BEAT_COOLDOWN)) {
                this.lastBeatTime = currentTime;
                audioFeatures.beat = true;
                
                // BPM calculation for uploaded MP3 files
                if (!this.isMicActive && window.audioPlayer && window.audioPlayer.src) {
                    this.beatHistory.push(currentTime);
                    if (this.beatHistory.length > this.BPM_HISTORY_LENGTH) {
                        this.beatHistory.shift();
                    }
                    
                    if (this.beatHistory.length >= 4 && (currentTime - this.lastBPMCalculation > 2.0)) {
                        const timeSpan = this.beatHistory[this.beatHistory.length - 1] - this.beatHistory[0];
                        const avgBeatInterval = timeSpan / (this.beatHistory.length - 1);
                        this.currentBPM = Math.round(60 / avgBeatInterval);
                        audioFeatures.bpm = this.currentBPM;
                        this.lastBPMCalculation = currentTime;
                        console.log(`BPM calculated: ${this.currentBPM} (from ${this.beatHistory.length} beats)`);
                    }
                }
                
                console.log(`Beat detected! Bass: ${audioFeatures.bass.toFixed(2)}, BPM: ${audioFeatures.bpm}`);
            }

            // Vocal detection
            if (audioFeatures.vocals > this.VOCAL_THRESHOLD && (currentTime - this.lastVocalTime > this.VOCAL_COOLDOWN)) {
                this.lastVocalTime = currentTime;
                audioFeatures.vocal = true;
                console.log(`Vocal detected! Level: ${audioFeatures.vocals.toFixed(2)}`);
            }

            // Snare detection
            const combinedSnare = (audioFeatures.snare + audioFeatures.snareHigh) / 2;
            if (combinedSnare > this.SNARE_THRESHOLD && (currentTime - this.lastSnareTime > this.SNARE_COOLDOWN)) {
                this.lastSnareTime = currentTime;
                audioFeatures.snareHit = true;
                console.log(`Snare detected! Combined level: ${combinedSnare.toFixed(2)}`);
            }
        }

        return audioFeatures;
    }

    fullReset() {
        console.log("Full audio reset...");
        
        this.lastBeatTime = 0;
        this.lastVocalTime = 0;
        this.lastSnareTime = 0;
        this.isAudioSetup = false;
        
        if (this.isMicActive) {
            this.stopMicrophone();
        }
        
        if (this.audioSourceNode) {
            try {
                this.audioSourceNode.disconnect();
            } catch (e) {
                console.warn("Error disconnecting audio source:", e);
            }
        }
        
        if (this.audioContext && this.audioContext.state !== 'closed') {
            try {
                this.audioContext.close();
            } catch (e) {
                console.warn("Error closing audio context:", e);
            }
        }
        
        this.audioSourceNode = null;
        this.audioContext = null;
        this.analyserNode = null;
        this.audioDataArray = null;
        
        console.log("Audio reset complete");
    }

    updateMicGain(value) {
        if (this.micGainNode) {
            this.micGainNode.gain.value = parseFloat(value);
        }
    }
} 