import * as THREE from 'three';
import SimplexNoise from 'simplex-noise';

export const simplex = new SimplexNoise();

// ── Materials & geometry prototypes ───────────────────────────────
// export const chrome = new THREE.MeshStandardMaterial({color:0xd8d8d8,metalness:1,roughness:.12,envMapIntensity:2}); // Keep in main if used by other things
// export const debugMaterial = new THREE.MeshBasicMaterial({color: 0x00ff00, wireframe: true }); // Keep in main

// Sigil/Branch Specific Constants
export const SEG_PER_SECOND = 90; // This might be more of an animation loop concern, but tied to growth speed
export const MAX_BRANCH_DEPTH = 4;
export const BRANCHING_PROBABILITY = 0.003; // Used in main event handler, might need to be passed or re-evaluated
export const NOISE_DISPLACEMENT_STRENGTH = 0.02;
export const NOISE_DISPLACEMENT_SCALE = 0.4;
export let currentBranchGrowthSpeed = 8.0; // Default, will be modulated
const MIN_GROWTH_SPEED = 2.0;
const MAX_GROWTH_SPEED = 20.0;

// Dynamic Geometry Constants
export const MAX_POINTS_PER_BRANCH_PATH = 150;

// New constants for 3D tubes (grain-based)
export const TUBE_SIDES = 8;
export const TUBE_BASE_RADIUS = 0.25;
export const TUBE_TAPER_POWER = 1.5;
export const TUBE_DEPTH_SCALE_FACTOR = 0.75;

// Particle/grain constants
export const GRAINS_PER_RING = 6;
export const GRAIN_SIZE = 0.04;
export const GRAIN_SIZE_ATTENUATION = true;

// New constants for interaction-based growth modification
const INTERACTION_GROWTH_SPEED_MULTIPLIER = 0.2;

export const MAX_VERTICES_PER_BRANCH_GEOMETRY = MAX_POINTS_PER_BRANCH_PATH * TUBE_SIDES * 6;
export const MAX_GRAINS_PER_BRANCH = MAX_POINTS_PER_BRANCH_PATH * GRAINS_PER_RING * 2;

// Branch Materials
export const BRANCH_MATERIAL_CONFIG = {
    metalness: 0.8,
    roughness: 0.25,
    envMapIntensity: 1.5,
    side: THREE.DoubleSide,
    transparent: false,
    emissive: new THREE.Color(0xffffff),
    emissiveIntensity: 1.0
};
// Initial color, will be changed dynamically
const INITIAL_BRANCH_COLOR = new THREE.Color(0xffffff);

// Helper vectors and function for triangle strip generation
export const globalReferenceUp = new THREE.Vector3(0, 1, 0);
export const globalReferenceRight = new THREE.Vector3(1, 0, 0);
export const tempVecP1 = new THREE.Vector3(); // Not directly used by getSideVector, but keep for now
export const tempVecP2 = new THREE.Vector3(); // Not directly used by getSideVector
export const tempTangent1 = new THREE.Vector3(); // Used in growStep
export const tempSide = new THREE.Vector3();
export const tempNormal = new THREE.Vector3();
export const edge1 = new THREE.Vector3();
export const edge2 = new THREE.Vector3();
export const tempBiNormal = new THREE.Vector3(); // Used in growStep
export const crossSectionVertex = new THREE.Vector3(); // Used in growStep


export function getSideVector(tangent, outSideVec) {
    outSideVec.crossVectors(tangent, globalReferenceUp).normalize();
    if (outSideVec.lengthSq() < 0.0001) {
        outSideVec.crossVectors(tangent, globalReferenceRight).normalize();
    }
    if (outSideVec.lengthSq() < 0.0001) {
        outSideVec.set(1,0,0);
    }
    return outSideVec;
}

export function createBranch(startPos, direction, seed, depth){ 
    const SEG_POINTS = MAX_POINTS_PER_BRANCH_PATH;
    const LEN  = (depth === 0) ? 25 : Math.max(5, 20 / (depth * 1.2)); 
    const curvePts  = [];
    for(let i=0;i<=SEG_POINTS;i++){
      const u=i/SEG_POINTS;
      const z=u*LEN;
      const sway = simplex.noise2D(u*2+seed,seed)*1.5 * (1 / (depth + 1));
      const bend = simplex.noise2D(u*2+seed+20,seed-10)*1.5 * (1 / (depth + 1));
      const right = new THREE.Vector3().crossVectors(direction,new THREE.Vector3(0,1,0)).normalize();
      const up    = new THREE.Vector3().crossVectors(right,direction).normalize();
      const p = new THREE.Vector3().copy(startPos)
        .addScaledVector(direction,z)
        .addScaledVector(right,sway)
        .addScaledVector(up,bend);
      curvePts.push(p);
    }

    for (let pt of curvePts) {
      const dx = simplex.noise3D(pt.x * NOISE_DISPLACEMENT_SCALE, pt.y * NOISE_DISPLACEMENT_SCALE, pt.z * NOISE_DISPLACEMENT_SCALE + seed) * NOISE_DISPLACEMENT_STRENGTH * (1/(depth+1));
      const dy = simplex.noise3D(pt.y * NOISE_DISPLACEMENT_SCALE, pt.z * NOISE_DISPLACEMENT_SCALE, pt.x * NOISE_DISPLACEMENT_SCALE + seed + 5) * NOISE_DISPLACEMENT_STRENGTH * (1/(depth+1));
      const dz = simplex.noise3D(pt.z * NOISE_DISPLACEMENT_SCALE, pt.x * NOISE_DISPLACEMENT_SCALE, pt.y * NOISE_DISPLACEMENT_SCALE + seed + 10) * NOISE_DISPLACEMENT_STRENGTH * (1/(depth+1));
      pt.add(new THREE.Vector3(dx, dy, dz));
    }

    const curve = new THREE.CatmullRomCurve3(curvePts);
    const curveLength = curve.getLength();

    // Grain/particle-based geometry
    const grainPositionsArray = new Float32Array(MAX_GRAINS_PER_BRANCH * 3);
    const grainColorsArray = new Float32Array(MAX_GRAINS_PER_BRANCH * 3);
    const grainSizesArray = new Float32Array(MAX_GRAINS_PER_BRANCH);
    
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(grainPositionsArray, 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('color', new THREE.BufferAttribute(grainColorsArray, 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('size', new THREE.BufferAttribute(grainSizesArray, 1).setUsage(THREE.DynamicDrawUsage));
    
    // Generate electric blue or grey color for this branch
    const colorChoice = Math.abs(seed) % 10;
    let branchColor;
    if (colorChoice < 6) {
        // Electric blue variants
        const blueIntensity = 0.7 + (Math.abs(seed) % 30) / 100;
        branchColor = new THREE.Color(0.1, 0.4 + (Math.abs(seed) % 20) / 100, blueIntensity);
    } else {
        // Grey variants
        const greyLevel = 0.5 + (Math.abs(seed) % 40) / 100;
        branchColor = new THREE.Color(greyLevel, greyLevel, greyLevel * 1.1);
    }
    
    const mesh = new THREE.Points(geometry, new THREE.PointsMaterial({
        size: GRAIN_SIZE,
        vertexColors: true,
        transparent: true,
        opacity: 1.0,
        sizeAttenuation: GRAIN_SIZE_ATTENUATION,
        blending: THREE.NormalBlending,
        depthWrite: true
    }));
    geometry.setDrawRange(0, 0); 
    mesh.renderOrder = 0;
    
    console.log(`CreateBranch (depth ${depth}, seed ${seed.toFixed(0)}): totalLength=${curveLength.toFixed(2)}, curvePoints.length=${curvePts.length}, MaxVertices=${MAX_VERTICES_PER_BRANCH_GEOMETRY}`);

    return {
      curve,
      curvePoints: curvePts,
      mesh: mesh, 
      currentLength: 0,
      totalLength: curveLength,
      drawnPathSegments: 0,
      currentVertexCount: 0,
      currentGrainCount: 0,
      childrenSpawned: 0,
      seed,
      depth,
      branchColor: branchColor
    };
}

// Update grain colors based on audio - no position changes
export function animateGrains(branch, audioFeatures = { bass: 0, mid: 0, treble: 0, beat: false, overallVolume: 0 }) {
    if (branch.currentGrainCount === 0) return;
    
    const audioMagnitude = (audioFeatures.bass + audioFeatures.mid + audioFeatures.treble) / 3;
    if (audioMagnitude < 0.03) return;
    
    const grainColor = branch.branchColor.clone();
    
    // Intensify the color based on audio
    const intensity = 1.0 + audioMagnitude * 2.0;
    grainColor.r = Math.min(grainColor.r * intensity, 1.0);
    grainColor.g = Math.min(grainColor.g * intensity * 1.2, 1.0);
    grainColor.b = Math.min(grainColor.b * intensity * 1.5, 1.0);
    
    const colors = branch.mesh.geometry.attributes.color.array;
    
    for (let k = 0; k < branch.currentGrainCount; k++) {
        const idx = k * 3;
        colors[idx] = grainColor.r;
        colors[idx + 1] = grainColor.g;
        colors[idx + 2] = grainColor.b;
    }
    
    branch.mesh.geometry.attributes.color.needsUpdate = true;
}

export function growStep(branch, delta, sigil, isInteracting = false, audioFeatures = { bass: 0, mid: 0, treble: 0, beat: false, overallVolume: 0 }){
    const isGrowthComplete = branch.currentLength >= branch.totalLength && branch.drawnPathSegments >= (branch.curvePoints.length -1);
    
    if (isGrowthComplete) {
        return false; 
    }
   
    let geometryNeedsUpdate = false; 

    // Modulate growth speed by audio
    const audioSpeedFactor = 1.0 + (audioFeatures.mid * 1.5) + (audioFeatures.overallVolume * 0.5);
    currentBranchGrowthSpeed = THREE.MathUtils.clamp(
        currentBranchGrowthSpeed * audioSpeedFactor,
        MIN_GROWTH_SPEED,
        MAX_GROWTH_SPEED
    );

    const effectiveGrowthSpeed = isInteracting ? currentBranchGrowthSpeed * INTERACTION_GROWTH_SPEED_MULTIPLIER : currentBranchGrowthSpeed;
    branch.currentLength += effectiveGrowthSpeed * delta;
    const justReachedFullLength = branch.currentLength >= branch.totalLength;
    branch.currentLength = Math.min(branch.currentLength, branch.totalLength);

    const totalPathSegments = branch.curvePoints.length - 1;
    const targetSegmentsToDraw = Math.min(Math.floor((branch.currentLength / branch.totalLength) * totalPathSegments), totalPathSegments);
    const segmentsAlreadyDrawn = branch.drawnPathSegments;

    // Use the branch's unique color (consistent for all grains in this tentacle)
    const audioMagnitude = (audioFeatures.bass + audioFeatures.mid + audioFeatures.treble) / 3;
    const grainColor = branch.branchColor.clone();
    
    // Intensify the color based on audio - make electric blue pop
    if (audioMagnitude > 0.03) {
        const intensity = 1.0 + audioMagnitude * 2.0;
        grainColor.r = Math.min(grainColor.r * intensity, 1.0);
        grainColor.g = Math.min(grainColor.g * intensity * 1.2, 1.0);
        grainColor.b = Math.min(grainColor.b * intensity * 1.5, 1.0);
    }

    if (targetSegmentsToDraw > segmentsAlreadyDrawn || (justReachedFullLength && segmentsAlreadyDrawn < totalPathSegments) ) {
        const positions = branch.mesh.geometry.attributes.position.array;
        const colors = branch.mesh.geometry.attributes.color.array;
        const sizes = branch.mesh.geometry.attributes.size.array;
        let grainOffset = branch.currentGrainCount;

        const loopEndSegments = justReachedFullLength ? Math.min(targetSegmentsToDraw + 1, totalPathSegments) : targetSegmentsToDraw;

        for (let i = segmentsAlreadyDrawn; i < loopEndSegments; i++) {
            if (i >= totalPathSegments) break; 

            const p1 = branch.curvePoints[i];
            const p2 = branch.curvePoints[i+1];
            if (!p1 || !p2) {
                console.error("Error: p1 or p2 is undefined in growStep for grain segment", i, branch.curvePoints.length);
                continue; 
            }

            const u1 = i / totalPathSegments;
            branch.curve.getTangentAt(u1, tempTangent1).normalize();
            getSideVector(tempTangent1, tempSide); 
            tempBiNormal.crossVectors(tempTangent1, tempSide).normalize(); 

            const u2 = Math.min((i + 1) / totalPathSegments, 1.0); 
            const tempTangent2_local = new THREE.Vector3(); 
            branch.curve.getTangentAt(u2, tempTangent2_local).normalize(); 
            const tempSide2_local = new THREE.Vector3(); 
            getSideVector(tempTangent2_local, tempSide2_local);
            const tempBiNormal2_local = new THREE.Vector3().crossVectors(tempTangent2_local, tempSide2_local).normalize();
            
            const depthScale = 1 / (1 + branch.depth * TUBE_DEPTH_SCALE_FACTOR);

            const taperFactor1 = Math.pow(1 - u1, TUBE_TAPER_POWER);
            const effectiveRadius1 = TUBE_BASE_RADIUS * taperFactor1 * depthScale;
            const taperFactor2 = Math.pow(1 - u2, TUBE_TAPER_POWER);
            const effectiveRadius2 = TUBE_BASE_RADIUS * taperFactor2 * depthScale;

            // Place grains around the tube circumference at both ring positions
            for (let j = 0; j < GRAINS_PER_RING; j++) {
                if (grainOffset >= MAX_GRAINS_PER_BRANCH) break;
                
                const angle = (j / GRAINS_PER_RING) * 2 * Math.PI;
                const angleJitter = (Math.random() - 0.5) * 0.3;
                const radiusJitter = 1.0 + (Math.random() - 0.5) * 0.2;
                
                // Ring 1 grain (at p1)
                const grainPos1 = crossSectionVertex.copy(p1)
                    .addScaledVector(tempSide, Math.cos(angle + angleJitter) * effectiveRadius1 * radiusJitter)
                    .addScaledVector(tempBiNormal, Math.sin(angle + angleJitter) * effectiveRadius1 * radiusJitter);
                
                const idx1 = grainOffset * 3;
                positions[idx1] = grainPos1.x;
                positions[idx1 + 1] = grainPos1.y;
                positions[idx1 + 2] = grainPos1.z;
                
                // Use branch color for all grains (same color per tentacle)
                colors[idx1] = grainColor.r;
                colors[idx1 + 1] = grainColor.g;
                colors[idx1 + 2] = grainColor.b;
                
                // Size varies with taper and slight randomness
                const baseSize = GRAIN_SIZE * taperFactor1 * depthScale;
                sizes[grainOffset] = baseSize * (0.7 + Math.random() * 0.6);
                
                grainOffset++;
                
                // Ring 2 grain (at p2) - interpolated position
                if (grainOffset >= MAX_GRAINS_PER_BRANCH) break;
                
                const grainPos2 = crossSectionVertex.copy(p2)
                    .addScaledVector(tempSide2_local, Math.cos(angle + angleJitter) * effectiveRadius2 * radiusJitter)
                    .addScaledVector(tempBiNormal2_local, Math.sin(angle + angleJitter) * effectiveRadius2 * radiusJitter);
                
                const idx2 = grainOffset * 3;
                positions[idx2] = grainPos2.x;
                positions[idx2 + 1] = grainPos2.y;
                positions[idx2 + 2] = grainPos2.z;
                
                // Use branch color for all grains (same color per tentacle)
                colors[idx2] = grainColor.r;
                colors[idx2 + 1] = grainColor.g;
                colors[idx2 + 2] = grainColor.b;
                
                sizes[grainOffset] = baseSize * (0.7 + Math.random() * 0.6);
                
                grainOffset++;
            }
            
            geometryNeedsUpdate = true; 
        } 
        
        branch.currentGrainCount = grainOffset;
        branch.drawnPathSegments = targetSegmentsToDraw; 
        
        if(geometryNeedsUpdate){
          branch.mesh.geometry.setDrawRange(0, branch.currentGrainCount);
          branch.mesh.geometry.attributes.position.needsUpdate = true;
          branch.mesh.geometry.attributes.color.needsUpdate = true;
          branch.mesh.geometry.attributes.size.needsUpdate = true;
          branch.mesh.geometry.computeBoundingSphere(); 
          branch.mesh.geometry.computeBoundingBox(); 
        }
    }

    return geometryNeedsUpdate;
}

export class Cybersigil {
    constructor(scene, initialGroupPosition, initialDirection, initialSeed, mirrorX = false, mirrorY = false, mirrorZ = false) {
        this.scene = scene;
        this.group = new THREE.Group();
        this.group.position.copy(initialGroupPosition);
        this.scene.add(this.group);

        this.branches = [];
        this.seed = initialSeed || Math.random() * 1000;

        const primaryBranchStartPos = new THREE.Vector3(0,0,0); // Relative to group

        // Create and add the primary root branch
        const primaryRootBranch = createBranch(primaryBranchStartPos, initialDirection, this.seed, 0);
        this.branches.push(primaryRootBranch);
        this.group.add(primaryRootBranch.mesh);
        console.log("Cybersigil: Created primary root branch.");

        // Mirrored root branches
        const rootMirrorsToCreate = [];
        if (mirrorX) {
            rootMirrorsToCreate.push({ 
                direction: initialDirection.clone().setX(-initialDirection.x),
                seedOffset: 1000, description: "X-Mirrored Root"
            });
        }
        if (mirrorY) {
            rootMirrorsToCreate.push({ 
                direction: initialDirection.clone().setY(-initialDirection.y),
                seedOffset: 2000, description: "Y-Mirrored Root"
            });
        }
        if (mirrorZ) {
            rootMirrorsToCreate.push({ 
                direction: initialDirection.clone().setZ(-initialDirection.z),
                seedOffset: 3000, description: "Z-Mirrored Root"
            });
        }
        if (mirrorX && mirrorY) {
            rootMirrorsToCreate.push({ 
                direction: initialDirection.clone().setX(-initialDirection.x).setY(-initialDirection.y),
                seedOffset: 4000, description: "XY-Mirrored Root"
            });
        }
        if (mirrorX && mirrorZ) {
            rootMirrorsToCreate.push({ 
                direction: initialDirection.clone().setX(-initialDirection.x).setZ(-initialDirection.z),
                seedOffset: 5000, description: "XZ-Mirrored Root"
            });
        }
        if (mirrorY && mirrorZ) {
            rootMirrorsToCreate.push({ 
                direction: initialDirection.clone().setY(-initialDirection.y).setZ(-initialDirection.z),
                seedOffset: 6000, description: "YZ-Mirrored Root"
            });
        }
        if (mirrorX && mirrorY && mirrorZ) {
            rootMirrorsToCreate.push({ 
                direction: initialDirection.clone().setX(-initialDirection.x).setY(-initialDirection.y).setZ(-initialDirection.z),
                seedOffset: 7000, description: "XYZ-Mirrored Root"
            });
        }

        rootMirrorsToCreate.forEach(params => {
            const mirroredRootBranch = createBranch(primaryBranchStartPos, params.direction, this.seed + params.seedOffset, 0);
            this.branches.push(mirroredRootBranch);
            this.group.add(mirroredRootBranch.mesh);
            console.log(`Cybersigil: Created ${params.description} branch.`);
        });
    }

    spawnNewBranch(currentMirrorX, currentMirrorY, currentMirrorZ, audioFeatures = { beat: false }) {
        if (this.branches.length === 0) { 
            console.warn("Cybersigil.spawnNewBranch: No branches to spawn from. Should not happen if initialized.");
            return; 
        }

        let eligibleParentBranches = this.branches.filter(b => 
            b.depth < MAX_BRANCH_DEPTH && 
            b.curve && b.curve.points && b.curve.points.length >= 2
        );

        if (eligibleParentBranches.length === 0) {
            console.log("Cybersigil.spawnNewBranch: No eligible parent branches found.");
            return;
        }

        const parentBranch = eligibleParentBranches[Math.floor(Math.random() * eligibleParentBranches.length)];
        
        const u = Math.random() * 0.8 + 0.1; // Spawn new branch between 10% and 90% along parent
        const newBranchStartPos = parentBranch.curve.getPointAt(u);
        const tan = parentBranch.curve.getTangentAt(u).normalize();

        let newBranchDirection = tan.clone();
        const randVec = new THREE.Vector3(
            simplex.noise3D(u * 10 + parentBranch.seed, parentBranch.depth * 5 + 3, 0) * 2 - 1,
            simplex.noise3D(parentBranch.depth * 5 + 4, u * 10 + parentBranch.seed, 0) * 2 - 1,
            simplex.noise3D(0, parentBranch.depth * 5 + 5, u * 10 + parentBranch.seed) * 2 - 1
        ).normalize();
        let rotAxis = new THREE.Vector3().crossVectors(tan, randVec).normalize();
        if (rotAxis.lengthSq() < 0.01) { rotAxis.set(0,1,0).cross(tan).normalize(); }
        if (rotAxis.lengthSq() < 0.01) { rotAxis.set(1,0,0); }

        const angle = (simplex.noise2D(parentBranch.seed + u * 7, parentBranch.depth * 12) * 0.6 + 0.2) * Math.PI * 1.5 + Math.PI * 0.25;
        newBranchDirection.applyAxisAngle(rotAxis, angle);

        const newSeed = simplex.noise3D(newBranchStartPos.x, newBranchStartPos.y, newBranchStartPos.z + parentBranch.seed) * 1000;
        
        // Create Primary new branch
        const newPrimaryBranch = createBranch(newBranchStartPos, newBranchDirection, newSeed, parentBranch.depth + 1);
        this.branches.push(newPrimaryBranch);
        this.group.add(newPrimaryBranch.mesh);
        parentBranch.childrenSpawned = (parentBranch.childrenSpawned || 0) + 1;
        console.log(`Cybersigil: Parent (depth ${parentBranch.depth}, ID ${parentBranch.seed.toFixed(0)}) spawned child (depth ${newPrimaryBranch.depth}, ID ${newPrimaryBranch.seed.toFixed(0)})`);

        // Mirrored new branches
        const childMirrorsToCreate = [];
        if (currentMirrorX) {
            childMirrorsToCreate.push({ 
                startPos: newBranchStartPos.clone().setX(-newBranchStartPos.x),
                direction: newBranchDirection.clone().setX(-newBranchDirection.x),
                seedOffset: 1000, description: "X-Mirror Child"
            });
        }
        if (currentMirrorY) {
            childMirrorsToCreate.push({ 
                startPos: newBranchStartPos.clone().setY(-newBranchStartPos.y),
                direction: newBranchDirection.clone().setY(-newBranchDirection.y),
                seedOffset: 2000, description: "Y-Mirror Child"
            });
        }
        if (currentMirrorZ) {
            childMirrorsToCreate.push({ 
                startPos: newBranchStartPos.clone().setZ(-newBranchStartPos.z),
                direction: newBranchDirection.clone().setZ(-newBranchDirection.z),
                seedOffset: 3000, description: "Z-Mirror Child"
            });
        }
        if (currentMirrorX && currentMirrorY) {
             childMirrorsToCreate.push({ 
                startPos: newBranchStartPos.clone().setX(-newBranchStartPos.x).setY(-newBranchStartPos.y),
                direction: newBranchDirection.clone().setX(-newBranchDirection.x).setY(-newBranchDirection.y),
                seedOffset: 4000, description: "XY-Mirror Child"
            });
        }
        if (currentMirrorX && currentMirrorZ) {
             childMirrorsToCreate.push({ 
                startPos: newBranchStartPos.clone().setX(-newBranchStartPos.x).setZ(-newBranchStartPos.z),
                direction: newBranchDirection.clone().setX(-newBranchDirection.x).setZ(-newBranchDirection.z),
                seedOffset: 5000, description: "XZ-Mirror Child"
            });
        }
        if (currentMirrorY && currentMirrorZ) {
             childMirrorsToCreate.push({ 
                startPos: newBranchStartPos.clone().setY(-newBranchStartPos.y).setZ(-newBranchStartPos.z),
                direction: newBranchDirection.clone().setY(-newBranchDirection.y).setZ(-newBranchDirection.z),
                seedOffset: 6000, description: "YZ-Mirror Child"
            });
        }
        if (currentMirrorX && currentMirrorY && currentMirrorZ) {
             childMirrorsToCreate.push({ 
                startPos: newBranchStartPos.clone().setX(-newBranchStartPos.x).setY(-newBranchStartPos.y).setZ(-newBranchStartPos.z),
                direction: newBranchDirection.clone().setX(-newBranchDirection.x).setY(-newBranchDirection.y).setZ(-newBranchDirection.z),
                seedOffset: 7000, description: "XYZ-Mirror Child"
            });
        }

        childMirrorsToCreate.forEach(params => {
            const mirroredChildBranch = createBranch(params.startPos, params.direction, newSeed + params.seedOffset, parentBranch.depth + 1);
            this.branches.push(mirroredChildBranch);
            this.group.add(mirroredChildBranch.mesh);
            console.log(`Cybersigil: Parent (depth ${parentBranch.depth}) -> Created ${params.description} (depth ${mirroredChildBranch.depth})`);
        });
    }

    update(delta, isInteracting = false, audioFeatures = { bass: 0, mid: 0, treble: 0, beat: false, overallVolume: 0 }) {
        let sigilActivity = false;
        for (const branch of this.branches) {
            // Grow the branch if not complete
            if (growStep(branch, delta, this, isInteracting, audioFeatures)) {
                sigilActivity = true;
            }
            // Always animate grains for all branches (even completed ones)
            animateGrains(branch, audioFeatures);
        }
        return sigilActivity;
    }

    dispose() {
        this.branches.forEach(b => {
            if (b.mesh) {
                if (b.mesh.geometry) b.mesh.geometry.dispose();
                this.group.remove(b.mesh);
            }
        });
        this.branches.length = 0;
        if (this.group) {
            this.scene.remove(this.group);
        }
    }
} 