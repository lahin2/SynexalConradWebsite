// ===========================
// SIMULATION STATE
// ===========================
const state = {
    isRunning: false,
    time: 0,
    windAngle: 0,
    windSpeed: 15,
    windVertical: 0, // Vertical wind component (updraft/downdraft)
    windPattern: 'urban',
    learningRate: 0.5,

    // Swarm turbine (6 turbines in honeycomb)
    swarm: {
        turbines: [],
        totalEnergy: 0,
        totalEfficiency: 0,
        energyHistory: []
    },

    // Baseline turbine (single fixed)
    baseline: {
        angle: 0,
        tilt: 0,
        energy: 0,
        totalEnergy: 0,
        efficiency: 0,
        energyHistory: []
    },

    animationFrame: null
};

// Initialize swarm with 6 turbines in honeycomb pattern
function initializeSwarm() {
    const positions = [
        { x: 0, y: -1 },     // Top
        { x: 0.866, y: -0.5 }, // Top-right
        { x: 0.866, y: 0.5 },  // Bottom-right
        { x: 0, y: 1 },      // Bottom
        { x: -0.866, y: 0.5 }, // Bottom-left
        { x: -0.866, y: -0.5 } // Top-left
    ];

    state.swarm.turbines = positions.map((pos, i) => ({
        id: i,
        x: pos.x,
        y: pos.y,
        angle: 0,
        targetAngle: 0,
        tilt: 0,
        targetTilt: 0,
        energy: 0,
        efficiency: 0,
        rotation: 0
    }));
}

// ===========================
// DOM ELEMENTS
// ===========================
const elements = {
    // Controls
    windPattern: document.getElementById('wind-pattern'),
    learningRate: document.getElementById('learning-rate'),
    learningRateValue: document.getElementById('learning-rate-value'),
    windSpeed: document.getElementById('wind-speed'),
    windSpeedValue: document.getElementById('wind-speed-value'),
    startBtn: document.getElementById('start-btn'),
    resetBtn: document.getElementById('reset-btn'),

    // Swarm turbine
    swarmCanvas: document.getElementById('adaptive-canvas'),
    swarmAngle: document.getElementById('adaptive-angle'),
    swarmEnergy: document.getElementById('adaptive-energy'),
    swarmEfficiency: document.getElementById('adaptive-efficiency'),
    windIndicatorSwarm: document.getElementById('wind-indicator-adaptive'),

    // Baseline turbine
    baselineCanvas: document.getElementById('baseline-canvas'),
    baselineAngle: document.getElementById('baseline-angle'),
    baselineEnergy: document.getElementById('baseline-energy'),
    baselineEfficiency: document.getElementById('baseline-efficiency'),
    windIndicatorBaseline: document.getElementById('wind-indicator-baseline'),

    // Metrics
    totalAdaptiveBar: document.getElementById('total-adaptive-bar'),
    totalAdaptiveValue: document.getElementById('total-adaptive-value'),
    totalBaselineBar: document.getElementById('total-baseline-bar'),
    totalBaselineValue: document.getElementById('total-baseline-value'),
    avgAdaptiveBar: document.getElementById('avg-adaptive-bar'),
    avgAdaptiveValue: document.getElementById('avg-adaptive-value'),
    avgBaselineBar: document.getElementById('avg-baseline-bar'),
    avgBaselineValue: document.getElementById('avg-baseline-value'),
    improvementPercentage: document.getElementById('improvement-percentage'),

    // Chart
    energyChart: document.getElementById('energy-chart')
};

// Canvas contexts
const ctx = {
    swarm: elements.swarmCanvas.getContext('2d'),
    baseline: elements.baselineCanvas.getContext('2d'),
    chart: elements.energyChart.getContext('2d')
};

// ===========================
// EVENT LISTENERS
// ===========================
elements.learningRate.addEventListener('input', (e) => {
    state.learningRate = parseFloat(e.target.value);
    elements.learningRateValue.textContent = state.learningRate.toFixed(1);
});

elements.windSpeed.addEventListener('input', (e) => {
    state.windSpeed = parseFloat(e.target.value);
    elements.windSpeedValue.textContent = state.windSpeed;
});

elements.windPattern.addEventListener('change', (e) => {
    state.windPattern = e.target.value;
});

elements.startBtn.addEventListener('click', toggleSimulation);
elements.resetBtn.addEventListener('click', resetSimulation);

// ===========================
// WIND SIMULATION
// ===========================
function updateWind() {
    const t = state.time;

    switch (state.windPattern) {
        case 'steady':
            state.windAngle = 90; // East
            state.windVertical = 0;
            break;

        case 'gusty':
            state.windAngle = 90 + Math.sin(t / 30) * 45;
            state.windSpeed = parseFloat(elements.windSpeed.value) * (0.7 + Math.random() * 0.6);
            state.windVertical = Math.sin(t / 20) * 3;
            break;

        case 'rotating':
            state.windAngle = (t * 2) % 360;
            state.windVertical = Math.sin(t / 40) * 2;
            break;

        case 'urban':
            // Realistic urban wind with building effects
            const baseSpeed = parseFloat(elements.windSpeed.value);

            // Horizontal wind with channeling effects (Venturi)
            state.windAngle = 90 +
                Math.sin(t / 50) * 40 +      // Slow direction change
                Math.sin(t / 13) * 15 +      // Building channeling
                (Math.random() - 0.5) * 8;   // Turbulence

            // Variable speed with gusts
            state.windSpeed = baseSpeed * (
                0.75 +
                Math.sin(t / 35) * 0.25 +    // Periodic variation
                Math.random() * 0.15         // Gusts
            );

            // Vertical wind (updrafts from heated buildings, downdrafts from wind shear)
            state.windVertical =
                Math.sin(t / 45) * 4 +        // Thermal updrafts
                Math.sin(t / 17) * 2 +        // Building wake effects
                Math.cos(t / 29) * 1.5 +      // Wind shear
                (Math.random() - 0.5) * 1;    // Turbulent eddies
            break;

        case 'variable':
        default:
            // Realistic wind with multiple frequencies
            state.windAngle = 90 +
                Math.sin(t / 50) * 30 +
                Math.sin(t / 23) * 15 +
                Math.cos(t / 37) * 10;

            const baseSpeed2 = parseFloat(elements.windSpeed.value);
            state.windSpeed = baseSpeed2 * (0.8 + Math.sin(t / 40) * 0.2 + Math.random() * 0.1);
            state.windVertical = Math.sin(t / 30) * 2;
            break;
    }
}

// ===========================
// ENERGY CALCULATION
// ===========================
function calculateEnergy(turbineAngle, turbineTilt, windAngle, windSpeed, windVertical, isSmallTurbine = false) {
    // Calculate horizontal angle difference
    let angleDiff = Math.abs(windAngle - turbineAngle);

    // Normalize to 0-180
    if (angleDiff > 180) {
        angleDiff = 360 - angleDiff;
    }

    // Horizontal alignment factor
    const horizontalAlignment = Math.cos(angleDiff * Math.PI / 180);

    // Vertical alignment factor (tilt vs vertical wind)
    // Positive tilt = angled up, positive windVertical = updraft
    const optimalTilt = Math.atan2(windVertical, windSpeed) * 180 / Math.PI;
    const tiltDiff = Math.abs(turbineTilt - optimalTilt);
    const verticalAlignment = Math.cos(tiltDiff * Math.PI / 180);

    // Combined alignment
    const totalAlignment = Math.max(0, horizontalAlignment * 0.7 + verticalAlignment * 0.3);

    // Effective wind speed considering vertical component
    const effectiveWind = Math.sqrt(windSpeed * windSpeed + windVertical * windVertical);

    // Wind turbine power formula (simplified): P = 0.5 * ρ * A * v^3 * Cp
    // Small turbines have 60% blade radius = 36% swept area
    const sizeMultiplier = isSmallTurbine ? 0.36 : 1.0;
    const energy = 0.5 * totalAlignment * Math.pow(effectiveWind / 10, 3) * 100 * sizeMultiplier;

    return {
        energy: Math.max(0, energy),
        efficiency: totalAlignment * 100,
        optimalTilt: optimalTilt
    };
}

// ===========================
// SWARM TURBINE INTELLIGENCE
// ===========================
function updateSwarmTurbines() {
    let totalEnergy = 0;
    let totalEfficiency = 0;

    state.swarm.turbines.forEach((turbine, index) => {
        // Each turbine independently optimizes
        const currentResult = calculateEnergy(
            turbine.angle,
            turbine.tilt,
            state.windAngle,
            state.windSpeed,
            state.windVertical,
            true // Small turbine
        );

        // Gradient-based learning for horizontal angle
        const delta = 5;
        const leftResult = calculateEnergy(
            turbine.angle - delta,
            turbine.tilt,
            state.windAngle,
            state.windSpeed,
            state.windVertical,
            true
        );
        const rightResult = calculateEnergy(
            turbine.angle + delta,
            turbine.tilt,
            state.windAngle,
            state.windSpeed,
            state.windVertical,
            true
        );

        // Update target horizontal angle
        if (leftResult.energy > currentResult.energy && leftResult.energy >= rightResult.energy) {
            turbine.targetAngle = turbine.angle - delta * state.learningRate;
        } else if (rightResult.energy > currentResult.energy) {
            turbine.targetAngle = turbine.angle + delta * state.learningRate;
        } else {
            turbine.targetAngle = state.windAngle;
        }

        // Update target tilt angle (optimize for vertical wind)
        turbine.targetTilt = Math.max(-30, Math.min(30, currentResult.optimalTilt * state.learningRate));

        // Smooth movement toward targets
        const angleError = turbine.targetAngle - turbine.angle;
        turbine.angle += angleError * 0.1 * state.learningRate;
        turbine.angle = (turbine.angle + 360) % 360;

        const tiltError = turbine.targetTilt - turbine.tilt;
        turbine.tilt += tiltError * 0.08 * state.learningRate;
        turbine.tilt = Math.max(-30, Math.min(30, turbine.tilt));

        // Calculate final energy
        const result = calculateEnergy(
            turbine.angle,
            turbine.tilt,
            state.windAngle,
            state.windSpeed,
            state.windVertical,
            true
        );

        turbine.energy = result.energy;
        turbine.efficiency = result.efficiency;
        turbine.rotation = (turbine.rotation + result.energy * 0.5) % 360;

        totalEnergy += result.energy;
        totalEfficiency += result.efficiency;
    });

    // Swarm synergy bonus (when turbines align well together)
    const avgAngle = state.swarm.turbines.reduce((sum, t) => sum + t.angle, 0) / 6;
    const angleVariance = state.swarm.turbines.reduce((sum, t) => {
        const diff = Math.abs(t.angle - avgAngle);
        return sum + (diff > 180 ? 360 - diff : diff);
    }, 0) / 6;
    const synergyBonus = 1 + (1 - angleVariance / 180) * 0.15; // Up to 15% bonus for alignment

    state.swarm.totalEnergy += (totalEnergy * synergyBonus) / 60; // Convert to kWh
    state.swarm.totalEfficiency = totalEfficiency / 6;
    state.swarm.currentEnergy = totalEnergy * synergyBonus;
}

// ===========================
// BASELINE TURBINE
// ===========================
function updateBaselineTurbine() {
    // Fixed angle turbine (single, large)
    const result = calculateEnergy(
        state.baseline.angle,
        state.baseline.tilt,
        state.windAngle,
        state.windSpeed,
        state.windVertical,
        false // Large turbine
    );
    state.baseline.energy = result.energy;
    state.baseline.efficiency = result.efficiency;
    state.baseline.totalEnergy += result.energy / 60; // Convert to kWh
}

// ===========================
// RENDERING
// ===========================
function drawSwarmTurbines(context) {
    const canvas = context.canvas;
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const spacing = 50; // Distance between turbines
    const turbineSize = 25; // Smaller turbines

    context.clearRect(0, 0, canvas.width, canvas.height);

    // Draw wind direction indicator (horizontal)
    context.save();
    context.translate(centerX, centerY);
    context.rotate((state.windAngle - 90) * Math.PI / 180);

    context.strokeStyle = 'rgba(74, 172, 254, 0.4)';
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(-120, 0);
    context.lineTo(120, 0);
    context.lineTo(110, -6);
    context.moveTo(120, 0);
    context.lineTo(110, 6);
    context.stroke();
    context.restore();

    // Draw vertical wind indicator
    const verticalStrength = Math.abs(state.windVertical) / 10;
    const verticalColor = state.windVertical > 0 ?
        `rgba(255, 200, 100, ${verticalStrength})` :
        `rgba(100, 200, 255, ${verticalStrength})`;

    context.fillStyle = verticalColor;
    context.fillRect(10, 10, 8, 60);

    // Arrow for updraft/downdraft
    context.fillStyle = state.windVertical > 0 ?
        'rgba(255, 200, 100, 0.8)' :
        'rgba(100, 200, 255, 0.8)';
    if (state.windVertical > 0) {
        // Up arrow
        context.beginPath();
        context.moveTo(14, 10);
        context.lineTo(8, 20);
        context.lineTo(20, 20);
        context.fill();
    } else {
        // Down arrow
        context.beginPath();
        context.moveTo(14, 70);
        context.lineTo(8, 60);
        context.lineTo(20, 60);
        context.fill();
    }

    // Draw honeycomb structure
    context.strokeStyle = 'rgba(74, 172, 254, 0.2)';
    context.lineWidth = 2;
    state.swarm.turbines.forEach((turbine) => {
        const tx = centerX + turbine.x * spacing;
        const ty = centerY + turbine.y * spacing;

        // Hexagon around each turbine
        context.beginPath();
        for (let i = 0; i < 6; i++) {
            const angle = (i * 60 - 30) * Math.PI / 180;
            const x = tx + Math.cos(angle) * (turbineSize * 1.2);
            const y = ty + Math.sin(angle) * (turbineSize * 1.2);
            if (i === 0) context.moveTo(x, y);
            else context.lineTo(x, y);
        }
        context.closePath();
        context.stroke();
    });

    // Draw each turbine
    state.swarm.turbines.forEach((turbine) => {
        const tx = centerX + turbine.x * spacing;
        const ty = centerY + turbine.y * spacing;

        context.save();
        context.translate(tx, ty);

        // Tilt visualization (skew the turbine)
        const tiltFactor = turbine.tilt / 100; // -0.3 to 0.3
        context.transform(1, tiltFactor, 0, 1, 0, 0);

        // Rotate for wind direction
        context.rotate((turbine.angle - 90) * Math.PI / 180);

        // Turbine pole
        context.fillStyle = 'rgba(74, 172, 254, 0.6)';
        context.fillRect(-3, 0, 6, 40);

        // Hub
        const gradient = context.createRadialGradient(0, 0, 0, 0, 0, turbineSize / 2);
        gradient.addColorStop(0, '#4facfe');
        gradient.addColorStop(1, '#00f2fe');
        context.fillStyle = gradient;
        context.beginPath();
        context.arc(0, 0, turbineSize / 2, 0, Math.PI * 2);
        context.fill();

        // Blades (3 blades)
        for (let i = 0; i < 3; i++) {
            context.save();
            context.rotate((turbine.rotation + (i * 120)) * Math.PI / 180);

            const bladeGradient = context.createLinearGradient(0, 0, turbineSize * 1.3, 0);
            bladeGradient.addColorStop(0, 'rgba(74, 172, 254, 1)');
            bladeGradient.addColorStop(1, 'rgba(0, 242, 254, 0.3)');

            context.fillStyle = bladeGradient;
            context.beginPath();
            context.ellipse(turbineSize * 0.65, 0, turbineSize * 0.65, turbineSize * 0.15, 0, 0, Math.PI * 2);
            context.fill();

            context.strokeStyle = 'rgba(255, 255, 255, 0.3)';
            context.lineWidth = 1;
            context.stroke();

            context.restore();
        }

        context.restore();
    });

    // Draw labels
    context.fillStyle = '#ffffff';
    context.font = '12px Inter';
    context.textAlign = 'center';
    context.fillText(`Wind: ${Math.round(state.windAngle)}° H, ${state.windVertical.toFixed(1)} V`, centerX, canvas.height - 35);
    context.fillText(`Avg Tilt: ${(state.swarm.turbines.reduce((s, t) => s + t.tilt, 0) / 6).toFixed(1)}°`, centerX, canvas.height - 20);
}

function drawTurbine(context, angle, tilt, windAngle, isBaseline = false) {
    const canvas = context.canvas;
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const size = 80;

    context.clearRect(0, 0, canvas.width, canvas.height);

    // Draw wind direction indicator
    context.save();
    context.translate(centerX, centerY);
    context.rotate((windAngle - 90) * Math.PI / 180);

    context.strokeStyle = 'rgba(245, 87, 108, 0.5)';
    context.lineWidth = 3;
    context.beginPath();
    context.moveTo(-150, 0);
    context.lineTo(150, 0);
    context.lineTo(140, -10);
    context.moveTo(150, 0);
    context.lineTo(140, 10);
    context.stroke();

    context.restore();

    // Draw vertical wind indicator
    const verticalStrength = Math.abs(state.windVertical) / 10;
    const verticalColor = state.windVertical > 0 ?
        `rgba(255, 200, 100, ${verticalStrength})` :
        `rgba(100, 200, 255, ${verticalStrength})`;

    context.fillStyle = verticalColor;
    context.fillRect(10, 10, 10, 80);

    // Draw turbine
    context.save();
    context.translate(centerX, centerY);
    context.rotate((angle - 90) * Math.PI / 180);

    // Turbine base (pole)
    context.fillStyle = 'rgba(245, 87, 108, 0.8)';
    context.fillRect(-8, 0, 16, 120);

    // Turbine hub
    const gradient = context.createRadialGradient(0, 0, 0, 0, 0, size / 2);
    gradient.addColorStop(0, '#f093fb');
    gradient.addColorStop(1, '#f5576c');

    context.fillStyle = gradient;
    context.beginPath();
    context.arc(0, 0, size / 2, 0, Math.PI * 2);
    context.fill();

    // Turbine blades (3 blades)
    const bladeRotation = (state.time * 2) % 360;

    for (let i = 0; i < 3; i++) {
        context.save();
        context.rotate((bladeRotation + (i * 120)) * Math.PI / 180);

        const bladeGradient = context.createLinearGradient(0, 0, size * 1.5, 0);
        bladeGradient.addColorStop(0, 'rgba(245, 87, 108, 1)');
        bladeGradient.addColorStop(1, 'rgba(240, 147, 251, 0.3)');

        context.fillStyle = bladeGradient;
        context.beginPath();
        context.ellipse(size * 0.8, 0, size * 0.8, size * 0.2, 0, 0, Math.PI * 2);
        context.fill();

        context.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        context.lineWidth = 2;
        context.stroke();

        context.restore();
    }

    context.restore();

    // Draw angle indicator text
    context.fillStyle = '#ffffff';
    context.font = '14px Inter';
    context.textAlign = 'center';
    context.fillText(`Turbine: ${Math.round(angle)}°`, centerX, canvas.height - 40);
    context.fillText(`Wind: ${Math.round(windAngle)}°`, centerX, canvas.height - 20);
}

function updateDisplay() {
    // Update swarm stats
    const avgAngle = state.swarm.turbines.reduce((s, t) => s + t.angle, 0) / 6;
    const avgTilt = state.swarm.turbines.reduce((s, t) => s + t.tilt, 0) / 6;

    elements.swarmAngle.textContent = `${Math.round(avgAngle)}° ∠${Math.round(avgTilt)}°`;
    elements.swarmEnergy.textContent = `${(state.swarm.currentEnergy || 0).toFixed(1)} kW`;
    elements.swarmEfficiency.textContent = `${state.swarm.totalEfficiency.toFixed(1)}%`;

    // Update baseline stats
    elements.baselineAngle.textContent = `${Math.round(state.baseline.angle)}°`;
    elements.baselineEnergy.textContent = `${state.baseline.energy.toFixed(1)} kW`;
    elements.baselineEfficiency.textContent = `${state.baseline.efficiency.toFixed(1)}%`;

    // Update wind indicators
    const windText = `💨 ${state.windSpeed.toFixed(1)} m/s ${state.windVertical > 0 ? '⬆' : '⬇'}${Math.abs(state.windVertical).toFixed(1)}`;
    elements.windIndicatorSwarm.textContent = windText;
    elements.windIndicatorBaseline.textContent = windText;

    // Update total energy bars
    const maxEnergy = Math.max(state.swarm.totalEnergy, state.baseline.totalEnergy, 1);

    elements.totalAdaptiveBar.style.width = `${(state.swarm.totalEnergy / maxEnergy) * 100}%`;
    elements.totalAdaptiveValue.textContent = `${state.swarm.totalEnergy.toFixed(2)} kWh`;

    elements.totalBaselineBar.style.width = `${(state.baseline.totalEnergy / maxEnergy) * 100}%`;
    elements.totalBaselineValue.textContent = `${state.baseline.totalEnergy.toFixed(2)} kWh`;

    // Update average power bars
    const avgSwarm = state.swarm.totalEnergy > 0 ?
        (state.swarm.totalEnergy / (state.time / 60)) : 0;
    const avgBaseline = state.baseline.totalEnergy > 0 ?
        (state.baseline.totalEnergy / (state.time / 60)) : 0;
    const maxAvg = Math.max(avgSwarm, avgBaseline, 1);

    elements.avgAdaptiveBar.style.width = `${(avgSwarm / maxAvg) * 100}%`;
    elements.avgAdaptiveValue.textContent = `${avgSwarm.toFixed(2)} kW`;

    elements.avgBaselineBar.style.width = `${(avgBaseline / maxAvg) * 100}%`;
    elements.avgBaselineValue.textContent = `${avgBaseline.toFixed(2)} kW`;

    // Update improvement percentage
    const improvement = state.baseline.totalEnergy > 0 ?
        ((state.swarm.totalEnergy - state.baseline.totalEnergy) / state.baseline.totalEnergy) * 100 : 0;

    elements.improvementPercentage.textContent = improvement >= 0 ?
        `+${improvement.toFixed(1)}%` : `${improvement.toFixed(1)}%`;
}

function drawChart() {
    const canvas = elements.energyChart;
    const context = ctx.chart;
    const width = canvas.width;
    const height = canvas.height;

    context.clearRect(0, 0, width, height);

    // Get data
    const maxPoints = 200;
    const swarmData = state.swarm.energyHistory.slice(-maxPoints);
    const baselineData = state.baseline.energyHistory.slice(-maxPoints);

    if (swarmData.length < 2) return;

    const maxEnergy = Math.max(
        ...swarmData,
        ...baselineData,
        1
    );

    const padding = 40;
    const chartWidth = width - padding * 2;
    const chartHeight = height - padding * 2;

    // Draw grid
    context.strokeStyle = 'rgba(102, 126, 234, 0.1)';
    context.lineWidth = 1;

    for (let i = 0; i <= 5; i++) {
        const y = padding + (chartHeight / 5) * i;
        context.beginPath();
        context.moveTo(padding, y);
        context.lineTo(width - padding, y);
        context.stroke();

        // Y-axis labels
        context.fillStyle = '#7780a1';
        context.font = '12px Inter';
        context.textAlign = 'right';
        const value = maxEnergy * (1 - i / 5);
        context.fillText(`${value.toFixed(0)} kW`, padding - 10, y + 4);
    }

    // Draw swarm line
    context.strokeStyle = '#4facfe';
    context.lineWidth = 3;
    context.beginPath();

    swarmData.forEach((energy, index) => {
        const x = padding + (chartWidth / (swarmData.length - 1)) * index;
        const y = padding + chartHeight - (energy / maxEnergy) * chartHeight;

        if (index === 0) {
            context.moveTo(x, y);
        } else {
            context.lineTo(x, y);
        }
    });

    context.stroke();

    // Draw baseline line
    context.strokeStyle = '#f5576c';
    context.lineWidth = 3;
    context.beginPath();

    baselineData.forEach((energy, index) => {
        const x = padding + (chartWidth / (baselineData.length - 1)) * index;
        const y = padding + chartHeight - (energy / maxEnergy) * chartHeight;

        if (index === 0) {
            context.moveTo(x, y);
        } else {
            context.lineTo(x, y);
        }
    });

    context.stroke();

    // Legend
    context.font = '14px Inter';
    context.textAlign = 'left';

    context.fillStyle = '#4facfe';
    context.fillRect(width - 180, 20, 20, 3);
    context.fillText('Swarm Turbines', width - 155, 25);

    context.fillStyle = '#f5576c';
    context.fillRect(width - 180, 40, 20, 3);
    context.fillText('Baseline Turbine', width - 155, 45);
}

// ===========================
// SIMULATION LOOP
// ===========================
function simulationLoop() {
    if (!state.isRunning) return;

    // Update simulation
    state.time++;
    updateWind();
    updateSwarmTurbines();
    updateBaselineTurbine();

    // Store energy history
    state.swarm.energyHistory.push(state.swarm.currentEnergy || 0);
    state.baseline.energyHistory.push(state.baseline.energy);

    // Limit history length
    if (state.swarm.energyHistory.length > 300) {
        state.swarm.energyHistory.shift();
        state.baseline.energyHistory.shift();
    }

    // Render
    drawSwarmTurbines(ctx.swarm);
    drawTurbine(ctx.baseline, state.baseline.angle, state.baseline.tilt, state.windAngle, true);
    updateDisplay();
    drawChart();

    // Continue loop
    state.animationFrame = requestAnimationFrame(simulationLoop);
}

// ===========================
// CONTROLS
// ===========================
function toggleSimulation() {
    state.isRunning = !state.isRunning;

    if (state.isRunning) {
        elements.startBtn.innerHTML = '<span class="btn-icon">⏸</span> Pause';
        elements.startBtn.classList.add('active');
        simulationLoop();
    } else {
        elements.startBtn.innerHTML = '<span class="btn-icon">▶</span> Resume';
        elements.startBtn.classList.remove('active');
        if (state.animationFrame) {
            cancelAnimationFrame(state.animationFrame);
        }
    }
}

function resetSimulation() {
    // Stop simulation
    state.isRunning = false;
    if (state.animationFrame) {
        cancelAnimationFrame(state.animationFrame);
    }

    // Reset state
    state.time = 0;
    state.windAngle = 0;
    state.windVertical = 0;

    initializeSwarm();
    state.swarm.totalEnergy = 0;
    state.swarm.totalEfficiency = 0;
    state.swarm.energyHistory = [];

    state.baseline.angle = 0;
    state.baseline.tilt = 0;
    state.baseline.energy = 0;
    state.baseline.totalEnergy = 0;
    state.baseline.efficiency = 0;
    state.baseline.energyHistory = [];

    // Reset UI
    elements.startBtn.innerHTML = '<span class="btn-icon">▶</span> Start Simulation';
    elements.startBtn.classList.remove('active');

    // Redraw
    drawSwarmTurbines(ctx.swarm);
    drawTurbine(ctx.baseline, 0, 0, 0, true);
    updateDisplay();

    // Clear chart
    ctx.chart.clearRect(0, 0, elements.energyChart.width, elements.energyChart.height);
}

// ===========================
// INITIALIZATION
// ===========================
function init() {
    // Initialize swarm
    initializeSwarm();

    // Set initial canvas sizes
    const dpr = window.devicePixelRatio || 1;

    [elements.swarmCanvas, elements.baselineCanvas].forEach(canvas => {
        const rect = canvas.getBoundingClientRect();
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        const ctx = canvas.getContext('2d');
        ctx.scale(dpr, dpr);
        canvas.style.width = rect.width + 'px';
        canvas.style.height = rect.height + 'px';
    });

    const chartRect = elements.energyChart.getBoundingClientRect();
    elements.energyChart.width = chartRect.width * dpr;
    elements.energyChart.height = chartRect.height * dpr;
    ctx.chart.scale(dpr, dpr);
    elements.energyChart.style.width = chartRect.width + 'px';
    elements.energyChart.style.height = chartRect.height + 'px';

    // Draw initial state
    drawSwarmTurbines(ctx.swarm);
    drawTurbine(ctx.baseline, 0, 0, 0, true);
    updateDisplay();
}

// Start when page loads
window.addEventListener('load', init);

// Handle window resize
window.addEventListener('resize', () => {
    init();
});
