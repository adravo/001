// build.rs — required by napi-build to generate the N-API entry point glue
extern crate napi_build;

fn main() {
    napi_build::setup();
}
