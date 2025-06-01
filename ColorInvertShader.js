import * as THREE from 'three';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

// Color Inversion Shader
export const ColorInvertShader = {
    uniforms: {
        'tDiffuse': { value: null },
        'uInvert': { value: 0.0 } // 0.0 = normal, 1.0 = fully inverted
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
        uniform float uInvert;
        varying vec2 vUv;

        void main() {
            vec4 color = texture2D(tDiffuse, vUv);
            
            // Invert RGB channels, keep alpha unchanged
            vec3 invertedColor = vec3(1.0) - color.rgb;
            
            // Mix between original and inverted based on uInvert value
            vec3 finalColor = mix(color.rgb, invertedColor, uInvert);
            
            gl_FragColor = vec4(finalColor, color.a);
        }
    `
};

// Color Inversion Manager Class
export class ColorInversionManager {
    constructor(composer) {
        this.composer = composer;
        this.invertPass = null;
        this.isInverted = false;
        this.isEnabled = false;
        
        this.initializeInvertPass();
    }
    
    initializeInvertPass() {
        this.invertPass = new ShaderPass(ColorInvertShader);
        this.invertPass.uniforms.uInvert.value = 0.0;
        // Don't add to composer yet - we'll add it when enabled
    }
    
    enableInversion() {
        if (!this.isEnabled && this.invertPass) {
            // Insert the invert pass before the output pass (last pass)
            const passes = this.composer.passes;
            const outputPassIndex = passes.length - 1;
            
            // Insert invert pass before output pass
            this.composer.insertPass(this.invertPass, outputPassIndex);
            this.isEnabled = true;
            console.log('Color inversion pass enabled');
        }
    }
    
    disableInversion() {
        if (this.isEnabled && this.invertPass) {
            this.composer.removePass(this.invertPass);
            this.isEnabled = false;
            this.isInverted = false;
            console.log('Color inversion pass disabled');
        }
    }
    
    toggleInversion() {
        if (!this.isEnabled) {
            this.enableInversion();
        }
        
        this.isInverted = !this.isInverted;
        
        if (this.invertPass) {
            this.invertPass.uniforms.uInvert.value = this.isInverted ? 1.0 : 0.0;
        }
        
        console.log(`Color inversion: ${this.isInverted ? 'ON' : 'OFF'}`);
        return this.isInverted;
    }
    
    setInversion(inverted) {
        if (!this.isEnabled) {
            this.enableInversion();
        }
        
        this.isInverted = inverted;
        if (this.invertPass) {
            this.invertPass.uniforms.uInvert.value = inverted ? 1.0 : 0.0;
        }
        
        return this.isInverted;
    }
    
    // For smooth transitions
    setInversionAmount(amount) {
        if (!this.isEnabled) {
            this.enableInversion();
        }
        
        amount = THREE.MathUtils.clamp(amount, 0.0, 1.0);
        if (this.invertPass) {
            this.invertPass.uniforms.uInvert.value = amount;
        }
        
        this.isInverted = amount > 0.5;
        return amount;
    }
    
    getInversionState() {
        return {
            isEnabled: this.isEnabled,
            isInverted: this.isInverted,
            amount: this.invertPass ? this.invertPass.uniforms.uInvert.value : 0.0
        };
    }
} 