#!/usr/bin/env bash
# Tiered Cache-Control for frontend/dist when publishing to S3 + CloudFront.
#
# Vite content-hashes JS/CSS under assets/; index.html and public/ copies
# (coi-serviceworker.js, wasm/) are not hashed. Pair short/no-cache headers
# on entrypoints with immutable caching on hashed bundles so releases propagate
# without invalidating the whole CDN on every deploy.

CACHE_HTML='no-cache, must-revalidate'
CACHE_IMMUTABLE='public, max-age=31536000, immutable'
CACHE_RUNTIME='public, max-age=3600'

# Sync frontend/dist to s3://bucket[/prefix]/ with tiered object metadata.
# Extra aws CLI args (e.g. --region) may be passed after dist_dir and dest.
publish_frontend_dist_to_s3() {
    local dist_dir="$1"
    local dest="$2"
    shift 2
    local aws_extra=("$@")

    echo "Publishing ${dist_dir}/ -> ${dest}/ (tiered Cache-Control)"

    # Baseline: short TTL for unhashed runtime files and anything not re-tagged below.
    aws s3 sync "${dist_dir}/" "${dest}/" \
        "${aws_extra[@]}" \
        --delete \
        --cache-control "${CACHE_RUNTIME}"

    if [[ -d "${dist_dir}/assets" ]]; then
        aws s3 sync "${dist_dir}/assets/" "${dest}/assets/" \
            "${aws_extra[@]}" \
            --cache-control "${CACHE_IMMUTABLE}"
    fi

    if [[ -f "${dist_dir}/index.html" ]]; then
        aws s3 cp "${dist_dir}/index.html" "${dest}/index.html" \
            "${aws_extra[@]}" \
            --cache-control "${CACHE_HTML}" \
            --content-type 'text/html; charset=utf-8'
    fi

    if [[ -f "${dist_dir}/coi-serviceworker.js" ]]; then
        aws s3 cp "${dist_dir}/coi-serviceworker.js" "${dest}/coi-serviceworker.js" \
            "${aws_extra[@]}" \
            --cache-control "${CACHE_RUNTIME}" \
            --content-type 'application/javascript; charset=utf-8'
    fi

    if [[ -d "${dist_dir}/wasm" ]]; then
        aws s3 sync "${dist_dir}/wasm/" "${dest}/wasm/" \
            "${aws_extra[@]}" \
            --cache-control "${CACHE_RUNTIME}"
    fi
}

# Default CloudFront invalidation paths when tiered caching is enabled.
default_cloudfront_invalidation_paths() {
    echo '/index.html' '/coi-serviceworker.js' '/wasm/*'
}
