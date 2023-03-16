#version 300 es

// Sentinel value for not finding any intersection
#define FAR_AWAY 1e9

precision mediump float;
uniform vec2 u_resolution;

uniform vec3 u_cameraOrigin;
uniform vec3 u_cameraForward;
uniform vec3 u_cameraUp;
uniform vec3 u_cameraRight;

struct Ray {
    vec3 origin;
    vec3 direction; // must be normalized
};

struct IntersectionResult {
    float distance;
    vec3 normal;
    vec3 pos;
    int material;
};

struct MaterialSample {
    vec3 color;
};

IntersectionResult ray_sphere_intersection(vec3 center, float radius, Ray ray) {
    vec3 oc = ray.origin - center;
    float b_half = dot(oc, ray.direction);
    float c = dot(oc, oc) - radius * radius;
    float discriminant = b_half * b_half - c;
    if (discriminant < 0.0) {
        IntersectionResult ret;
        ret.distance = FAR_AWAY;
        return ret;
    } else {
        IntersectionResult ret;
        ret.distance = (-b_half - sqrt(discriminant));
        ret.pos = ray.origin + ret.distance * ray.direction;
        ret.normal = (ret.pos - center) / radius;
        return ret;
    }
}

IntersectionResult ray_plane_intersection(vec3 point, vec3 normal, Ray ray) {
    IntersectionResult ret;
    ret.distance = dot(point - ray.origin, normal) / dot(ray.direction, normal);
    ret.pos = ray.origin + ret.distance * ray.direction;
    ret.normal = normal;
    return ret;
}

/// Möller–Trumbore ray-triangle intersection algorithm
/// Modified from https://github.com/erich666/jgt-code/blob/master/Volume_02/Number_1/Moller1997a/raytri.c
IntersectionResult ray_triangle_intersection(vec3 vert0, vec3 edge1, vec3 edge2, Ray ray) {
    IntersectionResult ret;
    ret.distance = FAR_AWAY;

    vec3 pvec = cross(ray.direction, edge2);

    float det = dot(edge1, pvec);

    if (det > -1e-6 && det < 1e-6)
        return ret; // ray is parallell to the plane of the triangle
        // TODO: This if det is very small, invDet will be very lareg and the u
        // and v tests will fail later. This branch is probably not necessary

    float invDet = 1.0 / det;

    // calculate distance from vert0 to ray origin
    vec3 tvec = ray.origin - vert0;

    // calculate U parameter and test bounds
    float u = dot(tvec, pvec) * invDet;
    if (u < 0.0 || u > 1.0)
        return ret; // TODO: Try adding some combination `step()` of `u` * FAR_AWAY to the result instead of returning early

    // prepare to test V parameter
    vec3 qvec = cross(tvec, edge1);

    // calculate V parameter and test bounds
    float v = dot(ray.direction, qvec) * invDet;
    if (v < 0.0 || u + v > 1.0)
        return ret; // TODO: As above, get rid of branch

    // calculate t, ray intersects triangle
    ret.distance = dot(edge2, qvec) * invDet;
    ret.normal = normalize(cross(edge1, edge2));
    ret.pos = ray.origin + ret.distance * ray.direction;
    return ret;
}

IntersectionResult ray_scene_intersection(Ray ray) {
    IntersectionResult ret;
    ret.distance = FAR_AWAY;

#define OBJ(intersectionFn, mat) \
    { \
        IntersectionResult objResult = (intersectionFn); \
        if (objResult.distance > 0.0 && objResult.distance < ret.distance) { \
            ret = objResult; \
            ret.material = (mat); \
        } \
    }

    // bottom sphere
    OBJ(ray_sphere_intersection(vec3(-1.0, 5, 0.5), 0.5, ray), 0);

    // top sphere
    OBJ(ray_sphere_intersection(vec3(-1.0, 5, 1.5), 0.5, ray), 1);

    // floor
    OBJ(ray_plane_intersection(vec3(0.0), vec3(0.0, 0.0, 1.0), ray), 2);

    // a random triangle
    OBJ(ray_triangle_intersection(vec3(1.0, 4.0, 1.2), vec3(-1.0, 1.0, 0.0), vec3(0.0, 0.0, -1.2), ray), 3);

#undef OBJ

    return ret;
}

MaterialSample sample_material(IntersectionResult intersection) {
    if (intersection.material == 2) {
        const float size = 0.5;
        const float halfLineThickness = 0.01;

        vec2 p = intersection.pos.xy / size;
        vec2 cellCoords = p - floor(p);

        vec2 border1 = step(cellCoords, vec2(halfLineThickness)) + step(vec2(1.0 - halfLineThickness), cellCoords);
        float border2 = max(border1.x, border1.y);

        MaterialSample ret;
        ret.color = vec3(0.0, 1.0, 0.0) * border2;
        return ret;

    } if (intersection.material == 3) {
        MaterialSample ret;
        ret.color = vec3(1.0, 0.0, 0.0);
        return ret;
    } else {
        MaterialSample ret;
        ret.color = vec3(0.5);
        return ret;
    }
}

Ray make_camera_ray(vec2 pixelPosition) {
    pixelPosition -= u_resolution / 2.0;

    Ray ret;
    ret.origin = u_cameraOrigin;
    ret.direction = normalize(
        u_cameraForward +
        u_cameraRight * pixelPosition.x +
        u_cameraUp * pixelPosition.y
    );

    return ret;
}

void main() {
    Ray ray = make_camera_ray(gl_FragCoord.xy);

    IntersectionResult intersection = ray_scene_intersection(ray);
    MaterialSample material = sample_material(intersection);

    if (intersection.distance < FAR_AWAY) {
        float shading = clamp(-dot(ray.direction, intersection.normal), 0.0, 1.0);

        gl_FragColor = vec4(material.color * shading, 1.0);
    } else {
        gl_FragColor = vec4(0.0, 0.0, 0.0, 1);
    }
}
