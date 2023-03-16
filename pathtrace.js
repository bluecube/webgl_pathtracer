function downloadFile(f) {
    return fetch(f).then(result => result.text());
}

function createShader(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
        throw Error('Shader compilation error: ' + gl.getShaderInfoLog(shader));
    return shader;
}

function createProgram(gl, shaders) {
    const program = gl.createProgram();
    shaders.forEach(s => gl.attachShader(program, s));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS))
        throw Error('Program linking error: ' + gl.getProgramInfoLog(program));
    return program;
}

/**
 * Create vertex positions buffer and assign it to `a_position` attribute.
 * Leaves the vertex position array buffer bound.
 */
function createVertexPositions(gl, program) {
    const vertexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
        -1, -1, 0, 1,
         1, -1, 0, 1,
        -1,  1, 0, 1,
         1,  1, 0, 1
    ]), gl.STATIC_DRAW);
    const positionAttributeLocation = gl.getAttribLocation(program, 'a_position');
    gl.enableVertexAttribArray(positionAttributeLocation);
    gl.vertexAttribPointer(positionAttributeLocation, 4, gl.FLOAT, false, 0, 0);
}

/**
 * Return a promise that takes the value of the #canvas element once the window is loaded.
 */
function findCanvas() {
    return new Promise((resolve, reject) => {
        window.addEventListener("load", resolve)
    }).then(() => document.getElementById("canvas"));
}

function crossProduct(v1, v2) {
    return [
        v1[1] * v2[2] - v1[2] * v2[1],
        v1[2] * v2[0] - v1[0] * v2[2],
        v1[0] * v2[1] - v1[1] * v2[0]
    ];
}

function normalize(v) {
    var len = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
    if (len === 0) {
        return [0, 0, 0];
    }
    return [v[0] / len, v[1] / len, v[2] / len];
}

function scale(v, s) {
    return v.map(x => x * s);
}

/**
 * Calculate camera forward, up and right vectors from a forward vector.
 * Outputs are mutually perpendicular, camera is oriented going up along the Z axis.
 * Forward is scaled by forwardScale, up and right are by upRightScale.
 */
function calculateCamera(forward, forwardScale, upRightScale) {
    const right = normalize(crossProduct(forward, [0, 0, 1]));
    const up = normalize(crossProduct(right, forward));
    return [
        scale(normalize(forward), forwardScale),
        scale(up, upRightScale),
        scale(right, upRightScale)
    ];
}

/**
 * Set camera control vectors in the uniform attributes
 */
function setupCameraUniforms(gl, program, origin, forward, up, right) {

    gl.uniform2f(gl.getUniformLocation(program, 'u_resolution'), gl.drawingBufferWidth, gl.drawingBufferHeight);

    gl.uniform3fv(gl.getUniformLocation(program, 'u_cameraOrigin'), origin);
    gl.uniform3fv(gl.getUniformLocation(program, 'u_cameraForward'), forward);
    gl.uniform3fv(gl.getUniformLocation(program, 'u_cameraUp'), up);
    gl.uniform3fv(gl.getUniformLocation(program, 'u_cameraRight'), right);
}

function render(gl) {
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    //requestAnimationFrame(render);
}

async function main() {
    let vertexShaderPromise = downloadFile("shader.vert");
    let fragmentShaderPromise = downloadFile("shader.frag");

    const canvas = await findCanvas();
    const gl = canvas.getContext('webgl');

    const vertexShader = createShader(gl, gl.VERTEX_SHADER, await vertexShaderPromise);
    const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, await fragmentShaderPromise);
    const program = createProgram(gl, [vertexShader, fragmentShader]);

    const resolutionUniformLocation = gl.getUniformLocation(program, 'u_resolution');

    createVertexPositions(gl, program);

    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.useProgram(program);

    cameraParams = calculateCamera(
        [0, 1, -0.1],
        1.5,
        1 / Math.min(gl.drawingBufferWidth, gl.drawingBufferHeight)
    );

    setupCameraUniforms(gl, program, [0, 0, 1.8], ...cameraParams);

    render(gl);
}

main();
