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
     * Return a pair of width and height, as close as possible to the actual canvas pixel size.
     */
    getCanvasSize() {
        const dpr = window.devicePixelRatio;
        const {width, height} = this.canvas.getBoundingClientRect();
        return [Math.round(width * dpr), Math.round(height * dpr)];
    }

    /**
     * Finds all active uniforms in the program and collects their locations in
     * uniformLoc map.
     */
    findUniforms(names) {
        const count = this.gl.getProgramParameter(this.program, this.gl.ACTIVE_UNIFORMS);
        this.uniformLoc = new Map();

        for (let i = 0; i < count; i++) {
            const name = this.gl.getActiveUniform(this.program, i).name;
            this.uniformLoc.set(name, this.gl.getUniformLocation(this.program, name));
        }
    }

    /**
     * Set camera control vectors in the uniform attributes
     */
    setupCameraUniforms(w, h, origin, forward, up, right) {
        this.gl.uniform2f(this.uniformLoc.get("u_resolution"), w, h);
        this.gl.uniform3fv(this.uniformLoc.get("u_cameraOrigin"), origin);
        this.gl.uniform3fv(this.uniformLoc.get("u_cameraForward"), forward);
        this.gl.uniform3fv(this.uniformLoc.get("u_cameraUp"), up);
        this.gl.uniform3fv(this.uniformLoc.get("u_cameraRight"), right);
    }

    render() {
        const [w, h] = this.getCanvasSize();
        this.canvas.width = w;
        this.canvas.height = h;

        console.log("rendering", w, h);
        const cameraParams = Pathtrace.calculateCamera(
            [0, 1, -0.1],
            1.5,
            1 / Math.min(w, h)
        );

        this.gl.viewport(0, 0, w, h);
        this.setupCameraUniforms(w, h, [0, 0, 1.8], ...cameraParams);

        const startTime = performance.now();
        this.gl.drawArrays(this.gl.TRIANGLE_STRIP, 0, 4);
        this.gl.finish();
        const elapsed = performance.now() - startTime;
        console.log(`Render took ${elapsed} milliseconds`);
    }

    async main() {
        let vertexShaderPromise = downloadFile("shader.vert");
        let fragmentShaderPromise = downloadFile("shader.frag");

        this.canvas = await Pathtrace.findCanvas();
        this.gl = this.canvas.getContext('webgl2');

        const vertexShader = this.createShader(this.gl.VERTEX_SHADER, await vertexShaderPromise);
        const fragmentShader = this.createShader(this.gl.FRAGMENT_SHADER, await fragmentShaderPromise);

        this.program = this.createProgram([vertexShader, fragmentShader]);
        this.findUniforms();

        const resolutionUniformLocation = this.gl.getUniformLocation(this.program, 'u_resolution');

        this.createVertexPositions();

        this.gl.clearColor(0, 0, 0, 0);
        this.gl.clear(this.gl.COLOR_BUFFER_BIT);

        this.gl.useProgram(this.program);

        this.render();

        window.addEventListener("resize", this.render.bind(this));
    }

}

pt = new Pathtrace();
pt.main();
