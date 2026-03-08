const fs = require('fs');
const { createCanvas } = require('canvas');

// Create 192x192 icon
const canvas192 = createCanvas(192, 192);
const ctx192 = canvas192.getContext('2d');
ctx192.fillStyle = '#4F46E5';
ctx192.fillRect(0, 0, 192, 192);
ctx192.fillStyle = '#ffffff';
ctx192.font = 'bold 80px Arial';
ctx192.textAlign = 'center';
ctx192.textBaseline = 'middle';
ctx192.fillText('O', 96, 96);

const buffer192 = canvas192.toBuffer('image/png');
fs.writeFileSync('icon-192x192.png', buffer192);

// Create 512x512 icon
const canvas512 = createCanvas(512, 512);
const ctx512 = canvas512.getContext('2d');
ctx512.fillStyle = '#4F46E5';
ctx512.fillRect(0, 0, 512, 512);
ctx512.fillStyle = '#ffffff';
ctx512.font = 'bold 200px Arial';
ctx512.textAlign = 'center';
ctx512.textBaseline = 'middle';
ctx512.fillText('O', 256, 256);

const buffer512 = canvas512.toBuffer('image/png');
fs.writeFileSync('icon-512x512.png', buffer512);

console.log('Icons generated successfully!');
