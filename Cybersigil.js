import * as THREE from 'three';
import SimplexNoise from 'simplex-noise';

export const simplex = new SimplexNoise();

// ── Materials & geometry prototypes ───────────────────────────────
// export const chrome = new THREE.MeshStandardMaterial({color:0xd8d8d8,metalness:1,roughness:.12,envMapIntensity:2}); // Keep in main if used by other things
// export const debugMaterial = new THREE.MeshBasicMaterial({color: 0x00ff00, wireframe: true }); // Keep in main

// Sigil/Branch Specific Constants
export const SEG_PER_SECOND = 90; // This might be more of an animation loop concern, but tied to growth speed
export const MAX_BRANCH_DEPTH = 4;
export const BRANCHING_PROBABILITY = 0.015; // Used in main event handler, might need to be passed or re-evaluated
export const NOISE_DISPLACEMENT_STRENGTH = 0.02;
export const NOISE_DISPLACEMENT_SCALE = 0.4;
export let currentBranchGrowthSpeed = 8.0; // Default, will be modulated
const MIN_GROWTH_SPEED = 2.0;
const MAX_GROWTH_SPEED = 20.0;

// Dynamic Geometry Constants
export const MAX_POINTS_PER_BRANCH_PATH = 150;

// New constants for 3D tubes
export const TUBE_SIDES = 6;
export const TUBE_BASE_RADIUS = 0.25;
export const TUBE_TAPER_POWER = 1.5;
export const TUBE_DEPTH_SCALE_FACTOR = 0.75;

// New constants for interaction-based growth modification
const INTERACTION_GROWTH_SPEED_MULTIPLIER = 0.2;

export const MAX_VERTICES_PER_BRANCH_GEOMETRY = MAX_POINTS_PER_BRANCH_PATH * TUBE_SIDES * 6;

// Branch Materials
export const BRANCH_MATERIAL_CONFIG = {
    metalness: 0.8,
    roughness: 0.25,
    envMapIntensity: 1.5,
    side: THREE.DoubleSide,
    transparent: false,
    emissive: new THREE.Color(0xffffff),
    emissiveIntensity: 0.7
};
// Initial color, will be changed dynamically
const INITIAL_BRANCH_COLOR = new THREE.Color(0x000000);

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
    const LEN  = (depth === 0) ? 15 : Math.max(3, 15 / (depth * 1.5)); 
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

    const positionsArray = new Float32Array(MAX_VERTICES_PER_BRANCH_GEOMETRY * 3);
    const normalsArray = new Float32Array(MAX_VERTICES_PER_BRANCH_GEOMETRY * 3);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positionsArray, 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('normal', new THREE.BufferAttribute(normalsArray, 3).setUsage(THREE.DynamicDrawUsage));
    
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
        ...BRANCH_MATERIAL_CONFIG,
        color: INITIAL_BRANCH_COLOR.clone()
    }));
    geometry.setDrawRange(0, 0); 
    mesh.renderOrder = 0; // Main branch renders first
    
    console.log(`CreateBranch (depth ${depth}, seed ${seed.toFixed(0)}): totalLength=${curveLength.toFixed(2)}, curvePoints.length=${curvePts.length}, MaxVertices=${MAX_VERTICES_PER_BRANCH_GEOMETRY}`);

    return {
      curve,
      curvePoints: curvePts,
      mesh: mesh, 
      currentLength: 0,
      totalLength: curveLength,
      drawnPathSegments: 0,
      currentVertexCount: 0, 
      childrenSpawned: 0,
      seed,
      depth
    };
}

export function growStep(branch, delta, sigil, isInteracting = false, audioFeatures = { bass: 0, mid: 0, treble: 0, beat: false, overallVolume: 0 }){
    if (branch.currentLength >= branch.totalLength && branch.drawnPathSegments >= (branch.curvePoints.length -1) ) {
        return false; 
    }
   
    let mainGeometryNeedsUpdate = false; 

    // Modulate growth speed by audio
    // Example: mid frequencies boost speed, overall volume gives a base modulation
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

    if (targetSegmentsToDraw > segmentsAlreadyDrawn || (justReachedFullLength && segmentsAlreadyDrawn < totalPathSegments) ) {
        const mainPositions = branch.mesh.geometry.attributes.position.array;
        const mainNormals = branch.mesh.geometry.attributes.normal.array; 
        let mainPositionAttributeOffset = branch.currentVertexCount * 3;
        let mainNormalAttributeOffset = branch.currentVertexCount * 3;

        const loopEndSegments = justReachedFullLength ? Math.min(targetSegmentsToDraw + 1, totalPathSegments) : targetSegmentsToDraw;

        for (let i = segmentsAlreadyDrawn; i < loopEndSegments; i++) {
            if (i >= totalPathSegments) break; 

            const p1 = branch.curvePoints[i];
            const p2 = branch.curvePoints[i+1];
            if (!p1 || !p2) {
                console.error("Error: p1 or p2 is undefined in growStep for tube segment", i, branch.curvePoints.length);
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

            const taperFactor1_main = Math.pow(1 - u1, TUBE_TAPER_POWER);
            const effectiveRadius1_main = TUBE_BASE_RADIUS * taperFactor1_main * depthScale;
            const taperFactor2_main = Math.pow(1 - u2, TUBE_TAPER_POWER);
            const effectiveRadius2_main = TUBE_BASE_RADIUS * taperFactor2_main * depthScale;

            // --- Audio Reactive Color --- 
            if (branch.mesh && branch.mesh.material) {
                const targetColor = new THREE.Color();
                targetColor.setRGB(
                    THREE.MathUtils.clamp(audioFeatures.bass * 3.0, 0, 1),       // Increased Red component reactivity
                    THREE.MathUtils.clamp(audioFeatures.mid * 2.5, 0, 1),        // Increased Green component reactivity
                    THREE.MathUtils.clamp(audioFeatures.treble * 3.5, 0, 1)     // Increased Blue component reactivity
                );
                if (branch.mesh.material.color) { 
                     branch.mesh.material.color.lerp(targetColor, 0.2); // Increased lerp factor for base color
                } else {
                    branch.mesh.material.color = targetColor; 
                }

                // Audio-reactive emissive color and intensity
                if (branch.mesh.material.emissive) { 
                    const emissiveTargetColor = new THREE.Color();
                    const overallBrightness = THREE.MathUtils.clamp(audioFeatures.overallVolume * 1.5, 0.1, 1.0); // Slightly increased overall brightness impact
                    emissiveTargetColor.setRGB(
                        THREE.MathUtils.clamp(audioFeatures.treble * 2.5 * overallBrightness, 0, 1),  // Increased Emissive R reactivity
                        THREE.MathUtils.clamp(audioFeatures.mid * 1.5 * overallBrightness, 0, 1),     // Increased Emissive G reactivity
                        THREE.MathUtils.clamp(audioFeatures.bass * 1.0 * overallBrightness, 0, 1)     // Increased Emissive B reactivity
                    );
                    branch.mesh.material.emissive.lerp(emissiveTargetColor, 0.25); // Increased lerp for emissive color

                    // Audio-reactive emissive intensity
                    // Base intensity is from BRANCH_MATERIAL_CONFIG.emissiveIntensity
                    const baseEmissiveIntensity = BRANCH_MATERIAL_CONFIG.emissiveIntensity || 0.7; // Fallback consistent with new base
                    const intensityPulse = audioFeatures.overallVolume * 1.0; // Increased pulse effect
                    branch.mesh.material.emissiveIntensity = THREE.MathUtils.clamp(baseEmissiveIntensity + intensityPulse, 0.3, 1.8); // Adjusted clamp range
                }
            }
            // --- End Audio Reactive Color ---

            for (let j = 0; j < TUBE_SIDES; j++) {
                const angle1 = (j / TUBE_SIDES) * 2 * Math.PI;
                const angle2 = ((j + 1) / TUBE_SIDES) * 2 * Math.PI;

                const v_p1_j_main = crossSectionVertex.copy(p1)
                    .addScaledVector(tempSide, Math.cos(angle1) * effectiveRadius1_main)
                    .addScaledVector(tempBiNormal, Math.sin(angle1) * effectiveRadius1_main).clone();
                const v_p1_j1_main = crossSectionVertex.copy(p1)
                    .addScaledVector(tempSide, Math.cos(angle2) * effectiveRadius1_main)
                    .addScaledVector(tempBiNormal, Math.sin(angle2) * effectiveRadius1_main).clone();
                const v_p2_j_main = crossSectionVertex.copy(p2)
                    .addScaledVector(tempSide2_local, Math.cos(angle1) * effectiveRadius2_main)
                    .addScaledVector(tempBiNormal2_local, Math.sin(angle1) * effectiveRadius2_main).clone();
                const v_p2_j1_main = crossSectionVertex.copy(p2)
                    .addScaledVector(tempSide2_local, Math.cos(angle2) * effectiveRadius2_main)
                    .addScaledVector(tempBiNormal2_local, Math.sin(angle2) * effectiveRadius2_main).clone();

                mainPositions[mainPositionAttributeOffset + 0] = v_p1_j_main.x;  mainPositions[mainPositionAttributeOffset + 1] = v_p1_j_main.y;  mainPositions[mainPositionAttributeOffset + 2] = v_p1_j_main.z;
                mainPositions[mainPositionAttributeOffset + 3] = v_p1_j1_main.x; mainPositions[mainPositionAttributeOffset + 4] = v_p1_j1_main.y; mainPositions[mainPositionAttributeOffset + 5] = v_p1_j1_main.z;
                mainPositions[mainPositionAttributeOffset + 6] = v_p2_j_main.x;  mainPositions[mainPositionAttributeOffset + 7] = v_p2_j_main.y;  mainPositions[mainPositionAttributeOffset + 8] = v_p2_j_main.z;
                edge1.subVectors(v_p1_j1_main, v_p1_j_main);
                edge2.subVectors(v_p2_j_main, v_p1_j_main);
                tempNormal.crossVectors(edge1, edge2).normalize();
                for(let n=0; n<3; ++n) { mainNormals[mainNormalAttributeOffset + n*3 + 0] = tempNormal.x; mainNormals[mainNormalAttributeOffset + n*3 + 1] = tempNormal.y; mainNormals[mainNormalAttributeOffset + n*3 + 2] = tempNormal.z; }
                mainPositionAttributeOffset += 9; mainNormalAttributeOffset += 9;
                branch.currentVertexCount += 3;

                mainPositions[mainPositionAttributeOffset + 0] = v_p1_j1_main.x; mainPositions[mainPositionAttributeOffset + 1] = v_p1_j1_main.y; mainPositions[mainPositionAttributeOffset + 2] = v_p1_j1_main.z;
                mainPositions[mainPositionAttributeOffset + 3] = v_p2_j1_main.x; mainPositions[mainPositionAttributeOffset + 4] = v_p2_j1_main.y; mainPositions[mainPositionAttributeOffset + 5] = v_p2_j1_main.z;
                mainPositions[mainPositionAttributeOffset + 6] = v_p2_j_main.x;  mainPositions[mainPositionAttributeOffset + 7] = v_p2_j_main.y;  mainPositions[mainPositionAttributeOffset + 8] = v_p2_j_main.z;
                edge1.subVectors(v_p2_j1_main, v_p1_j1_main);
                edge2.subVectors(v_p2_j_main, v_p1_j1_main);
                tempNormal.crossVectors(edge1, edge2).normalize();
                for(let n=0; n<3; ++n) { mainNormals[mainNormalAttributeOffset + n*3 + 0] = tempNormal.x; mainNormals[mainNormalAttributeOffset + n*3 + 1] = tempNormal.y; mainNormals[mainNormalAttributeOffset + n*3 + 2] = tempNormal.z; }
                mainPositionAttributeOffset += 9; mainNormalAttributeOffset += 9;
                branch.currentVertexCount += 3;
            } 
            mainGeometryNeedsUpdate = true; 
        } 
        
        branch.drawnPathSegments = targetSegmentsToDraw; 
        
        if(mainGeometryNeedsUpdate){
          branch.mesh.geometry.setDrawRange(0, branch.currentVertexCount);
          branch.mesh.geometry.attributes.position.needsUpdate = true;
          branch.mesh.geometry.attributes.normal.needsUpdate = true; 
          branch.mesh.geometry.computeBoundingSphere(); 
          branch.mesh.geometry.computeBoundingBox(); 
        }
    }

    return mainGeometryNeedsUpdate; // Now only depends on main geometry
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
            if (growStep(branch, delta, this, isInteracting, audioFeatures)) {
                sigilActivity = true;
            }
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