// JavaScript source code

var viewSize = 1000;

const WIDTH = window.innerHeight * 4 / 5;
const HEIGHT = WIDTH;

const VIEW_ANGLE = 45;
const ASPECT = WIDTH / HEIGHT;
const NEAR = 1;
const FAR = 10000;

var scene, renderer, container, camera, controls;

var particleCount, particles, pMaterial, particleSystem;

var root;

var circle = false; 
var R = 7;

function drawParticles() {
  particleCount = 10000;
  particles = new THREE.Geometry();
  pMaterial = new THREE.PointsMaterial({
    color: 0xFFFFFF,
    size: 0.01
  });

  var r, pX, pY, pZ; 

  for (var p = 0; p < particleCount; p++) {
    var phi = 2 * Math.PI * Math.random();
    var theta = Math.acos(Math.random()*2 - 1);

    if (circle) {
      r = R; 
      pX = r * Math.cos(phi);
      pY = r * Math.sin(phi); 
    }

    r = R * Math.cbrt(Math.random());

    pX = r * Math.sin(theta) * Math.cos(phi);
    pY = r * Math.sin(theta) * Math.sin(phi); 
    pZ = 0;

    var particle = new THREE.Vector3(pX, pY, pZ);

    var alpha = Math.atan2(pX, pZ);
    particle.velocity = new THREE.Vector3(0, 0, 0);

    particles.vertices.push(particle);
  }

  particleSystem = new THREE.Points(particles, pMaterial);

  scene.add(particleSystem);
}

function drawTree(n) {
  var mat = new THREE.LineBasicMaterial({
    color: 0x0000ff
  });

  var geo = new THREE.Geometry();

  geo.vertices.push(new THREE.Vector3(n.bounds[0][0], n.bounds[0][1], 0));
  geo.vertices.push(new THREE.Vector3(n.bounds[1][0], n.bounds[0][1], 0));
  geo.vertices.push(new THREE.Vector3(n.bounds[1][0], n.bounds[1][1], 0));
  geo.vertices.push(new THREE.Vector3(n.bounds[0][0], n.bounds[1][1], 0));
  geo.vertices.push(new THREE.Vector3(n.bounds[0][0], n.bounds[0][1], 0));

  var line = new THREE.Line(geo, mat);
  scene.add(line);
  
  if (n.nw != null) {
    drawTree(n.nw);
    drawTree(n.ne);
    drawTree(n.se);
    drawTree(n.sw);
  }
  return;
}

// constructor method for a node
function createNode(bounds, depth) {
  const node = {}

  node.depth = depth;

  node.bounds = bounds;

  node.particle = null;

  node.quads = false;

  // calculate the center of the node
  node.center = [
    (bounds[1][0] + bounds[0][0]) / 2,
    (bounds[1][1] + bounds[0][1]) / 2
  ];     

  // root node must have n = nparticles and cm of entire system
  // since we are working with uniform masses, our CM of mass 
  // equation can be reduced from 
  // x_cm = (m1*x1 + ... + mi*xi) / (m1 + ... + mi)
  // into 
  // x_cm = (x1 + ... + xi) / i 
  // which we can calculate using x_t / n at the force step
  node.n = 0;
  node.x_t = 0;
  node.y_t = 0;

  node.ne = null;
  node.sw = null;
  node.se = null;
  node.nw = null;

  return node;
}

function insertParticle(n, p) {
  // check to see if there is a particle here
  if (n.particle == null) {
    // there's no particle, so check to see if there are quadrants 
    n.n += 1;
    n.x_t += p.x;
    n.y_t += p.y;

    if (n.quads == false) {
      // if no quadrants, insert the particle to this node
      n.particle = p;
    } else {
      // if quadrants, pass particle to the proper quadrant 

      if (p.x > n.center[0]) {
        if (p.y > n.center[1]) insertParticle(n.ne, p);
        else insertParticle(n.se, p);
      } else {
        if (p.y > n.center[1]) insertParticle(n.nw, p);
        else insertParticle(n.sw, p);
      }
    }
  } else {
    // if a particle is here, build the new nodes 
    n.quads = true; 

    // reset node's stats, cause they'll be included when searching through
    // the quadrants 
    n.n = 0;
    n.x_t = 0;
    n.y_t = 0;

    // create quad nodes
    n.ne = createNode([n.center, n.bounds[1]], n.depth + 1);
    n.sw = createNode([n.bounds[0], n.center], n.depth + 1);
    n.se = createNode([
      [n.center[0], n.bounds[0][1]],
      [n.bounds[1][0], n.center[1]]
    ], n.depth + 1);
    n.nw = createNode([
      [n.bounds[0][0], n.center[1]],
      [n.center[0], n.bounds[1][1]]
    ], n.depth + 1);

    //create new sublist of particles
    plist = [n.particle, p];

    //remove particle from this node
    n.particle = null; 

    //iterate through plist and insert into new nodes
    for (i = 0; i < 2; i++) {
      insertParticle(n, plist[i]);
    }
  }

  return; 
}

function buildTree() {
  var root_bounds = [[-R, -R], [R, R]];
  root = createNode(root_bounds, 0);

  for (var i = 0; i < particleCount; i++) {
    var particle = particles.vertices[i];
    if (particle.x < root_bounds[1][0] && particle.x > root_bounds[0][0])
      if (particle.y < root_bounds[1][1] ** particle.y > root_bounds[0][1])
        insertParticle(root, particle);
  }
}

//gravitational constant
var G = 6.67408 * Math.pow(10, -11);
// mass in solar masses 
var m = 2*Math.pow(10, 30);
// conversion from 1 THREE unit to 
var r_scale = 0.4* 9.461 * Math.pow(10, 15);

var eps = Math.pow(10, -15);

var m_scale = 1;

var timestep = 100; 

function gravitationalForce(n, p) {
  var d = distance(n, p);

  if (d == 0) return [0, 0];

  var alpha = Math.atan2((n.y_t / n.n - p.y), (n.x_t / n.n - p.x));

  var F = G * (n.n * m) * m / Math.pow((eps + d) * r_scale, 2);

  var Fx = F * Math.cos(alpha); 
  var Fy = F * Math.sin(alpha);

  return [Fx, Fy];
}

function distance(n, p) {
  return Math.sqrt(Math.pow(n.x_t / n.n - p.x, 2) + Math.pow(n.x_t / n.n - p.y, 2));
}

var theta = 50;

function forceCalculation(n, p) {
  if (n.n < 1)
    return [0, 0]; 

  if (n.n == 1)
    return gravitationalForce(n, p);

  // calculation of the Multipole Acceptance Criterion, where if the ratio 
  // between the group's distance and group's radius falls below a threshold, 
  // we use the that node's center of mass and distance to compute forces 
  // d group is the size of the box, and group_r is the distance formula between
  // the group and the mass

  var d_group = Math.abs(n.bounds[1][0] - n.bounds[0][0]);
  var group_r = distance(n, p);

  if (group_r == 0)
    return [0, 0];

  if (d_group / group_r > theta) {
    // can keep iterating to the other nodes
    f_ne = forceCalculation(n.ne, p);
    f_nw = forceCalculation(n.nw, p);
    f_se = forceCalculation(n.se, p);
    f_sw = forceCalculation(n.sw, p);

    f_x = f_nw[0] + f_ne[0] + f_se[0] + f_sw[0];
    f_y = f_nw[1] + f_ne[1] + f_se[1] + f_sw[1];

    return [f_x, f_y];
  }
  else return gravitationalForce(n, p);
}

function updateParticles() {
  for (var i = 0; i < particleCount; i++) {
    var particle = particles.vertices[i];

    // F = ma, so can rearrange into a = F / m
    var F = forceCalculation(root, particle);

    // v = v0 + at 
    particle.velocity.x +=  F[0] / m * timestep;
    particle.velocity.y +=  F[1] / m * timestep;

    // x = x0 + vt + 0.5at^2
    particle.x += particle.velocity.x * timestep + 0.5 * F[0] / m * Math.pow(timestep, 2); 
    particle.y += particle.velocity.y * timestep + 0.5 * F[1] / m * Math.pow(timestep, 2);

    if (particle.x > 10 || particle.x < -10) {
      // "infinite" boundary, where particle escapes 
      if (infinite) continue;
      // "looping" boundary, where particle teleports to the other side 
      if (loop) particle.x = -particle.x;
      // "mirror" boundary, where particle hits and reflects off wall

    }
    if (particle.y > 10 || particle.y < -10) {
      // "infinite boundary 
      if (infinite) continue;
      // "looping" boundary
      if (loop) particle.y = -particle.y;
      // "mirror" boundary
      if (mirror) {

      }
    }
  }
  particles.verticesNeedUpdate = true;
}

var mirror, loop = false;
var infinite = true; 

var play = true; 
function animate() {
 requestAnimationFrame(animate);

  buildTree();
//  drawTree(root);
  updateParticles();

  renderer.render(scene, camera);
}

function init() {
  container = document.querySelector('#container');

  renderer = new THREE.WebGLRenderer();
  renderer.setSize(WIDTH, HEIGHT);
  renderer.domElement.id = 'render';

  scene = new THREE.Scene();

  camera = new THREE.PerspectiveCamera(VIEW_ANGLE, ASPECT, NEAR, FAR);
  camera.position.z = 25;

  scene.add(camera);

  container.appendChild(renderer.domElement);

  drawParticles();
  animate();
}

$(document).ready(function () {
  init();
});