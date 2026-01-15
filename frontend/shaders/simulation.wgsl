// main steps
// density_step()
// velocity_step()

// steps: u (and v)
// add_source(): write u
// add_source(): write v
//  - u, v array updated 1 time - cpu
// cpu to gpu
// advect(): read u0, read v0, read u0, write u
// advect(): read u0, read v0, read v0, write v
//  - u, v cells updated independently
//  - u, v cells updated conditionally
// diffuse(): read u0, read/write u
// diffuse(): read v0, read/write v
//  - u, v array updated and cells updated conditionally 20 times - compute shader
// project(): read/write u, read/write v, read/write q (temp1), read/write div (temp2)
//  - temp1, temp2 cells updated independently
//  - temp1, temp2 updated conditional on index
//  - temp1 array updated 20 times
//  - u, v cells updated independently
//  - u, v cells updated conditionally
// gpu to cpu

// steps: d
// add_source(): write d (from CPU)
//  - d array updated 1 time
// advect(): read u, read v, read d0, write d
//  - d cells updated independently
//  - d cells updated conditionally
// diffuse(): read d0, read/write d
//  - d array updated and cells updated conditionally 20 times - compute shader

// utility methods
// set_bounds(): read/write x
//  - cells updated conditionally 
// lin_solve(): read x0, read/write x, set_bound
//  - array updated 20 times
//  - cells updated conditionally