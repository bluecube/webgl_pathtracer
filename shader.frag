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

#undef OBJ

    return ret;
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

    if (intersection.distance < FAR_AWAY) {
        float c = 0.2 - dot(ray.direction, intersection.normal) / 2.0;
        //float c = intersection.distance / 3.0;

        gl_FragColor = vec4(vec3(c), 1);
    } else {
        gl_FragColor = vec4(0.1, 0.3, 0.1, 1);
    }
}
