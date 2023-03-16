function downloadFile(f) {
    return fetch(f).then(result => result.text());
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

class Pathtrace {
    createShader(type, source) {
        const shader = this.gl.createShader(type);
        this.gl.shaderSource(shader, source);
        this.gl.compileShader(shader);
        if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS))
            throw Error('Shader compilation error: ' + this.gl.getShaderInfoLog(shader));
        return shader;
    }

    createProgram(shaders) {
        const program = this.gl.createProgram();
        shaders.forEach(s => this.gl.attachShader(program, s));
        this.gl.linkProgram(program);
        if (!this.gl.getProgramParameter(program, this.gl.LINK_STATUS))
            throw Error('Program linking error: ' + this.gl.getProgramInfoLog(program));
        return program;
    }

    /**
     * Create vertex positions buffer prepared for a triangle strip covering the whole viewport
     * and assign it to `a_position` attribute.
     * Leaves the vertex position array buffer bound.
     */
    createVertexPositions() {
        const vertexBuffer = this.gl.createBuffer();
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, vertexBuffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array([
            -1, -1, 0, 1,
             1, -1, 0, 1,
            -1,  1, 0, 1,
             1,  1, 0, 1
        ]), this.gl.STATIC_DRAW);
        const positionAttributeLocation = this.gl.getAttribLocation(this.program, 'a_position');
        this.gl.enableVertexAttribArray(positionAttributeLocation);
        this.gl.vertexAttribPointer(positionAttributeLocation, 4, this.gl.FLOAT, false, 0, 0);
    }

    /**
     * Calculate camera forward, up and right vectors from a forward vector.
     * Outputs are mutually perpendicular, camera is oriented going up along the Z axis.
     * Forward is scaled by forwardScale, up and right are by upRightScale.
     */
    static calculateCamera(forward, forwardScale, upRightScale) {
        const right = normalize(crossProduct(forward, [0, 0, 1]));
        const up = normalize(crossProduct(right, forward));
        return [
            scale(normalize(forward), forwardScale),
            scale(up, upRightScale),
            scale(right, upRightScale)
        ];
    }

    /**
     * Return a promise that takes the value of the #canvas element once the window is loaded.
     */
    static findCanvas() {
        return new Promise((resolve, reject) => {
            window.addEventListener("load", resolve)
        }).then(() => document.getElementById("canvas"));
    }

    /**
     * Set camera control vectors in the uniform attributes
     */
    setupCameraUniforms(origin, forward, up, right) {

        this.gl.uniform2f(this.gl.getUniformLocation(this.program, 'u_resolution'), this.gl.drawingBufferWidth, this.gl.drawingBufferHeight);

        this.gl.uniform3fv(this.gl.getUniformLocation(this.program, 'u_cameraOrigin'), origin);
        this.gl.uniform3fv(this.gl.getUniformLocation(this.program, 'u_cameraForward'), forward);
        this.gl.uniform3fv(this.gl.getUniformLocation(this.program, 'u_cameraUp'), up);
        this.gl.uniform3fv(this.gl.getUniformLocation(this.program, 'u_cameraRight'), right);
    }

    render() {
        this.gl.drawArrays(this.gl.TRIANGLE_STRIP, 0, 4);
        //requestAnimationFrame(render);
    }

    async main() {
        let vertexShaderPromise = downloadFile("shader.vert");
        let fragmentShaderPromise = downloadFile("shader.frag");

        const canvas = await Pathtrace.findCanvas();
        this.gl = canvas.getContext('webgl');

        const vertexShader = this.createShader(this.gl.VERTEX_SHADER, await vertexShaderPromise);
        const fragmentShader = this.createShader(this.gl.FRAGMENT_SHADER, await fragmentShaderPromise);

        this.program = this.createProgram([vertexShader, fragmentShader]);

        const resolutionUniformLocation = this.gl.getUniformLocation(this.program, 'u_resolution');

        this.createVertexPositions();

        this.gl.viewport(0, 0, this.gl.drawingBufferWidth, this.gl.drawingBufferHeight);
        this.gl.clearColor(0, 0, 0, 0);
        this.gl.clear(this.gl.COLOR_BUFFER_BIT);

        this.gl.useProgram(this.program);

        const cameraParams = Pathtrace.calculateCamera(
            [0, 1, -0.1],
            1.5,
            1 / Math.min(this.gl.drawingBufferWidth, this.gl.drawingBufferHeight)
        );

        this.setupCameraUniforms([0, 0, 1.8], ...cameraParams);

        this.render();
    }

}

pt = new Pathtrace();
pt.main();
