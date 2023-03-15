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

function findCanvas() {
    return new Promise((resolve, reject) => {
        window.addEventListener("load", resolve)
    }).then(() => document.getElementById("canvas"));
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
    gl.uniform2f(resolutionUniformLocation, gl.drawingBufferWidth, gl.drawingBufferHeight);

    render(gl);
}

main();
