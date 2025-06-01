export const ThresholdShader = {
    uniforms: {
        'tDiffuse': { value: null },        // Sigils from RenderPass (on transparent background)
        'tThresholdMap': { value: null },  // Uploaded image, used for visibility control only
        'uThresholdStrength': { value: 0.5 },
        'uInverseThreshold': { value: true },
        'uTime': { value: 0.0 } 
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
        uniform sampler2D tThresholdMap;
        uniform float uThresholdStrength;
        uniform bool uInverseThreshold;
        uniform float uTime; 
        varying vec2 vUv;

        float grayscale(vec3 color) {
            return dot(color, vec3(0.299, 0.587, 0.114));
        }

        void main() {
            vec4 sigilColor = texture2D(tDiffuse, vUv);
            
            bool thresholdMapAvailable = (textureSize(tThresholdMap, 0).x > 1);
            
            if (!thresholdMapAvailable) {
                // No threshold map, just output the sigils as they are.
                gl_FragColor = sigilColor;
                return;
            }

            vec4 controlTex = texture2D(tThresholdMap, vUv);
            float thresholdValue = grayscale(controlTex.rgb);
            float visibility;

            if (uInverseThreshold) {
                visibility = smoothstep(0.0, uThresholdStrength, 1.0 - thresholdValue);
            } else {
                visibility = smoothstep(0.0, uThresholdStrength, thresholdValue);
            }
            
            vec4 outputColor = sigilColor;
            outputColor.a *= visibility; // Only affect sigil's alpha based on control map

            if (outputColor.a < 0.01) discard;
            gl_FragColor = outputColor;
        }
    `
}; 