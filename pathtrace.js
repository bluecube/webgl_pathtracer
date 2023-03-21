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
        const renderProgram = this.gl.createProgram();
        shaders.forEach(s => this.gl.attachShader(renderProgram, s));
        this.gl.linkProgram(renderProgram);
        if (!this.gl.getProgramParameter(renderProgram, this.gl.LINK_STATUS))
            throw Error('Program linking error: ' + this.gl.getProgramInfoLog(renderProgram));
        return renderProgram;
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
     * renderUniforms map.
     */
    findUniforms(program) {
        const count = this.gl.getProgramParameter(program, this.gl.ACTIVE_UNIFORMS);
        var ret = new Map();

        for (let i = 0; i < count; i++) {
            const name = this.gl.getActiveUniform(program, i).name;
            ret.set(name, this.gl.getUniformLocation(program, name));
        }

        return ret;
    }

    /**
     * Set camera control vectors in the uniform attributes
     */
    setupCameraUniforms(w, h, origin, forward, up, right) {
        this.gl.uniform2f(this.renderUniforms.get("u_resolution"), w, h);
        this.gl.uniform3fv(this.renderUniforms.get("u_cameraOrigin"), origin);
        this.gl.uniform3fv(this.renderUniforms.get("u_cameraForward"), forward);
        this.gl.uniform3fv(this.renderUniforms.get("u_cameraUp"), up);
        this.gl.uniform3fv(this.renderUniforms.get("u_cameraRight"), right);
    }

    /**
     * Set the seed value for random generation in the kernel.
     * This is really not critical at all, so we just use Math.random(), hopefully
     * extended to 32bit.
     */
    setupSeedUniform() {
        const seed = (Math.random() * 2**32) >>> 0;
        this.gl.uniform1ui(this.renderUniforms.get("u_seed"), seed);
    }

    createTextures(w, h) {
        // First delete old textures if there are any
        this.textures.forEach(texture => this.gl.deleteTexture(texture));
        this.textures = []

        for (var i = 0; i < 2; i++) {
            const texture = this.gl.createTexture();
            this.gl.bindTexture(this.gl.TEXTURE_2D, texture);
            this.gl.texImage2D(
                this.gl.TEXTURE_2D, 0 /*level*/, this.gl.RGBA32F,
                this.width, this.height, 0,
                this.gl.RGBA, this.gl.FLOAT, null
            );

            this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.NEAREST);
            this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.NEAREST);
            this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
            this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);

            this.textures.push(texture);
        }
    }

    request_frame() {
        window.requestAnimationFrame(this.run_iteration.bind(this));
    }

    restart() {
        const [w, h] = this.getCanvasSize();
        this.width = w;
        this.height = h;
        this.canvas.width = w;
        this.canvas.height = h;

        this.createTextures();

        this.iterationNumber = 0;

        this.run_iteration();
    }

    runProgram(program, displayTitle) {
        this.gl.viewport(0, 0, this.width, this.height);

        const startTime = performance.now();
        this.gl.drawArrays(this.gl.TRIANGLE_STRIP, 0, 4);
        this.gl.finish();
        const elapsed = performance.now() - startTime;
        return elapsed;
    }

    render(inputTexture, outputTexture) {
        this.gl.useProgram(this.renderProgram);

        const cameraParams = Pathtrace.calculateCamera(
            [0, 1, -0.1],
            1.5,
            1 / Math.min(this.width, this.height)
        );
        this.setupCameraUniforms(this.width, this.height, [0, 0, 1.8], ...cameraParams);
        this.gl.uniform1ui(this.renderUniforms.get("u_iterNumber"), this.iterationNumber);

        this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, this.fb);
        this.gl.framebufferTexture2D(this.gl.FRAMEBUFFER, this.gl.COLOR_ATTACHMENT0, this.gl.TEXTURE_2D, outputTexture, 0);

        this.gl.activeTexture(this.gl.TEXTURE0);
        this.gl.bindTexture(this.gl.TEXTURE_2D, inputTexture);
        this.gl.uniform1i(this.displayUniforms.get("u_previousIterTexture"), 0);

        const elapsed = this.runProgram(this.renderProgram);
        console.log(`Rendering iteration ${this.iterationNumber} took ${elapsed} milliseconds`);
        return elapsed;
    }

    display(displayTexture) {
        this.gl.useProgram(this.displayProgram);

        this.gl.uniform2f(this.displayUniforms.get("u_resolution"), this.width, this.height);

        this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);

        this.gl.activeTexture(this.gl.TEXTURE0);
        this.gl.bindTexture(this.gl.TEXTURE_2D, displayTexture);
        this.gl.uniform1i(this.displayUniforms.get("u_texture"), 0);

        return this.runProgram(this.displayProgram);
    }

    run_iteration(timestamp) {
        if (this.iterationNumber != 0 && timestamp < this.lastIterationTimestamp + 100) {
            /// Artificially slowing down the render so that we don't load the 
            // GPU too much and have it nicely animated
            this.request_frame();
            return;
        }
        this.lastIterationTimestamp = timestamp;

        this.iterationNumber += 1;

        const sourceTextureIndex = this.iterationNumber & 1;
        const targetTextureIndex = 1 - sourceTextureIndex;

        this.render(this.textures[sourceTextureIndex], this.textures[targetTextureIndex]);
        this.display(this.textures[targetTextureIndex]);

        if (this.iterationNumber < 100)
            this.request_frame();
    }

    async main() {
        let vertexShaderPromise = downloadFile("shader.vert");
        let fragmentShaderPromise = downloadFile("shader.frag");
        let displayShaderPromise = downloadFile("display.frag");

        this.canvas = await Pathtrace.findCanvas();
        this.gl = this.canvas.getContext('webgl2');
        if (this.gl === null)
            throw Error("Couldn't get webgl2 context");

        if (this.gl.getExtension("EXT_color_buffer_float") === null)
            throw Error("Couldn't get EXT_color_buffer_float extension");

        const vertexShader = this.createShader(this.gl.VERTEX_SHADER, await vertexShaderPromise);

        const displayShader = this.createShader(this.gl.FRAGMENT_SHADER, await displayShaderPromise);
        this.displayProgram = this.createProgram([vertexShader, displayShader]);
        this.displayUniforms = this.findUniforms(this.displayProgram);

        const fragmentShader = this.createShader(this.gl.FRAGMENT_SHADER, await fragmentShaderPromise);
        this.renderProgram = this.createProgram([vertexShader, fragmentShader]);
        this.renderUniforms = this.findUniforms(this.renderProgram);

        this.fb = this.gl.createFramebuffer();

        this.gl.clearColor(0, 0, 0, 0);
        this.gl.clear(this.gl.COLOR_BUFFER_BIT);

        this.textures = []

        this.restart();

        window.addEventListener("resize", this.restart.bind(this));
    }

}

pt = new Pathtrace();
pt.main();
