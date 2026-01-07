"use strict";

// Document elements
const refreshBtn = document.getElementById("refresh-btn");
const vehiclesDiv = document.getElementById("vehicles");
const canvas = document.getElementById("canvas");
const canvasColor = "rgba(252, 244, 209, 1)";
const ctx = canvas.getContext("2d");
// Page load routine
refreshBtn.addEventListener("click", fetchData);
canvas.width = Math.min(window.innerWidth, window.innerHeight) - 150;
canvas.height = Math.min(window.innerWidth, window.innerHeight) - 150;
resetCanvas();
fetchData();

// San Francisco border coordinates
const NORTH_BORDER = 37.830;
const SOUTH_BORDER = 37.704;
const EAST_BORDER = -122.359;
const WEST_BORDER = -122.517;

function calcX(longitude) {
    return (longitude - WEST_BORDER) / (EAST_BORDER - WEST_BORDER)
}
function calcY(latitude) {
    return 1 - (latitude - SOUTH_BORDER) / (NORTH_BORDER - SOUTH_BORDER)
}
function radians(degrees) {
    return Math.PI * degrees / 180.0;
}
function resetCanvas() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = canvasColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
}
function drawArrow(x, y, theta = 0, size = 5) {
    ctx.beginPath();
    let xt = x, yt = y;
    ctx.moveTo(xt, yt);
    xt += size * Math.cos(theta + 3.0*Math.PI/4.0);
    yt -= size * Math.sin(theta + 3.0*Math.PI/4.0);
    ctx.lineTo(xt, yt);
    xt += size/1.5 * Math.cos(theta);
    yt -= size/1.5 * Math.sin(theta);
    ctx.lineTo(xt, yt);
    xt -= size * Math.cos(theta + 3.0*Math.PI/4.0);
    yt += size * Math.sin(theta + 3.0*Math.PI/4.0);
    ctx.lineTo(xt, yt);
    xt += size * Math.cos(theta - 3.0*Math.PI/4.0);
    yt -= size * Math.sin(theta - 3.0*Math.PI/4.0);
    ctx.lineTo(xt, yt);
    xt -= size/1.5 * Math.cos(theta);
    yt += size/1.5 * Math.sin(theta);
    ctx.lineTo(xt, yt);
    xt -= size * Math.cos(theta - 3.0*Math.PI/4.0);
    yt += size * Math.sin(theta - 3.0*Math.PI/4.0);
    ctx.lineTo(xt, yt);
    ctx.closePath();
    ctx.fillStyle = "rgb(128 0 0)";
    ctx.fill();
}
function drawText(x, y, text, theta = 0, size = 5) {
    const fontsize = size * 2;
    ctx.font = `normal ${fontsize}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const metrics = ctx.measureText(text);
    const xcorr = size * 0.9;
    const ycorr = size * 0.9;
    const xl = x - ((metrics.width/2.0 + xcorr) * Math.cos(theta));
    const yl = y + ((metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent)/2.0 + ycorr) * Math.sin(theta);
    ctx.fillStyle = "rgb(0, 0, 0)";
    ctx.fillText(text, xl, yl);
}
function drawIcon(x, y, theta, size, label) {
    drawArrow(x, y, theta, size);
    drawText(x, y, label, theta, size);
}

async function fetchData() {
    // Fetch vehicle positions
    let vehicles;
    try {
        const request = new Request("http://localhost:8000/live");
        const response = await fetch(request);
        if (!response.ok) {
            throw new Error(`Response status: ${response.status} ${response.statusText}`);
        }
        vehicles = await response.json();
    } catch (e) {
        alert(e);
    }
    // Resize canvas
    canvas.width = Math.min(window.innerWidth, window.innerHeight) - 150;
    canvas.height = Math.min(window.innerWidth, window.innerHeight) - 150;
    // Draw on canvas
    if (canvas.getContext) {
        resetCanvas();
        for (const [_, vehicle] of Object.entries(vehicles)) {
            const x = calcX(vehicle.longitude) * canvas.width;
            const y = calcY(vehicle.latitude) * canvas.height;
            const theta = radians(-(vehicle.bearing + 90.0));
            drawIcon(x, y, theta, 6, vehicle.route_id);
        }
    } else {

    }

    // fetch("http://localhost:8000/live")
    //     .then((response) => {
    //         if (!response.ok) {
    //             throw new Error(`Could not open ${url}.`);
    //         }
    //         return response.text();
    //     })
    //     .then((text) => {
    //         const p = document.createElement("p");
    //         p.textContent = text;
    //         document.body.appendChild(p);
    //     })
    //     .catch((error) => {
    //         alert(error);
    //     });
}