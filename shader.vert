#version 300 es

in vec4 a_position;
void main() {
    vec2 vertexPos = vec2((gl_VertexID >> 1) & 1, gl_VertexID & 1) * 2.0 - 1.0;
    gl_Position = vec4(vertexPos, 0.0, 1.0);
}
