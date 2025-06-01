# Cybersigil Growth - Branching Animation

An interactive audio-reactive 3D visualization featuring cybersigil branching structures built with Three.js.

## Project Structure

The project has been modularized into separate files for better maintainability:

### Core Files

- **`index.html`** - Clean HTML structure with UI elements
- **`styles.css`** - All CSS styles including responsive design
- **`main.js`** - Main application logic, Three.js setup, and rendering loop
- **`audio.js`** - Audio processing, analysis, and microphone/file management  
- **`ui.js`** - UI controls, event listeners, and user interactions

### Modules

- **`Cybersigil.js`** - Core sigil geometry and growth logic
- **`ThresholdShader.js`** - Custom threshold post-processing shader
- **`ColorInvertShader.js`** - Color inversion post-processing effects

## Features

### Audio Reactivity
- **Vocal Detection** (300-3000Hz) → Spawns new sigil branches
- **Beat Detection** (20-250Hz) → Triggers background flashes and rotation changes
- **Snare Detection** (200-500Hz + 5000-10000Hz) → Visual effects (noise bursts, bloom)
- **Real-time BPM calculation** for uploaded MP3 files

### Input Sources
- **File Upload** - Upload MP3 files for analysis
- **Microphone Input** - Live audio analysis with gain control
- **Manual Controls** - Spacebar to spawn branches, R to reset

### Visual Effects
- **Post-processing pipeline** with bloom, noise, and threshold effects
- **Audio-reactive background flashes** on beats
- **Smooth 3-axis scene rotation** matched to BPM
- **Mirror controls** for X, Y, Z axis symmetry
- **Color inversion** toggle

### Responsive Design
- **Mobile-optimized UI** with touch-friendly controls
- **Collapsible effects panel** for mobile screens
- **Responsive layout** that adapts to different screen sizes

## Usage

1. Open `index.html` in a modern web browser
2. Upload an MP3 file or enable microphone input
3. Watch the sigils grow and react to audio:
   - Vocals spawn new branches
   - Beats trigger flashes and rotation changes
   - Snares create visual effect bursts
4. Use controls to adjust mirror symmetry and post-processing effects

## Controls

- **Space** - Manually spawn new branch
- **R** - Reset sigil
- **Mirror X/Y/Z** - Toggle axis mirroring
- **Microphone** - Toggle live audio input
- **Effects Panel** - Adjust noise, bloom, threshold, and other visual parameters

## Dependencies

- Three.js (imported from CDN)
- Web Audio API (built-in browser support)
- ES6 Modules (modern browser support required)

## Architecture

The application follows a modular architecture:

- `CybersigilApp` class coordinates all systems
- `AudioManager` handles all audio processing and analysis
- `UIManager` manages user interface and interactions
- `Cybersigil` class handles individual sigil geometry and growth
- Post-processing pipeline provides audio-reactive visual effects

This structure makes the codebase maintainable and allows for easy extension of features. 