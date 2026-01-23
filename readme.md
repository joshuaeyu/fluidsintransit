# San Francisco's MUNI fleet, visualized in a WebGPU fluid dynamics simulation

## Requirements

- Python 3.13 or higher
- [Browser with WebGPU support](https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API#browser_compatibility)

## Run the Simulation

Clone this repo and navigate to the project folder.

```shell
git clone https://github.com/joshuaeyu/fluidsintransit.git
cd fluidsintransit
```

Install the Python packages listed in `requirements.txt` (ideally within a [venv](https://docs.python.org/3/library/venv.html) or [conda](https://docs.conda.io/en/latest/) environment).

```shell
pip install -r requirements.txt
```

Launch the FastAPI app on port 8000.

```shell
fastapi run main.py --port 8000
```

In another shell instance, launch an HTTP server on port 8001 for the `frontend/` directory.

```shell
python -m http.server --directory frontend 8001
```

Optionally, in a third shell instance, launch the fetcher application to fetch live vehicle position information from the [511 SF Bay Open Data API](https://511.org/open-data/transit). 

```shell
cd backend
python -m src.services.fetcher
```

A few notes about the fetcher:

- Live vehicle positions are not required to run the simulation, since I've run the fetcher in advance and recorded several vehicle position history datasets in the provided SQLite database at `backend/data/database.db`, with the most recent "live" dataset also saved at `backend/data/cache.pkl`. My backend implementation handles database and cache access automatically.
- Fetching live data requires an [511 Open Data API token](https://511.org/open-data/token). The application expects the token to be saved in a text file at path `private/key.txt`.

## Components

- Frontend: HTML, CSS, JS, WebGPU
- Backend: Python, SQLite, SQLAlchemy, FastAPI

## References

### Literature

- J. Stam, Stable Fluids,, in *SIGGRAPH 1999 Conference proceedings: SIGGRAPH Annual Conference Series*, pp. 121-128, 1999.
- J. Stam, Real-Time Fluid Dynamics for Games, in *GDC 2003 Conference proceedings: Game Developers Conference*, 2003.
- M. Harris, "Fast Fluid Dynamics Simulation on the GPU", in *GPU Gems*.  Upper Saddle River, NJ, USA: Pearson Education, Inc., 2004, ch. 38. [Online]. Available: https://developer.nvidia.com/gpugems/gpugems/part-vi-beyond-triangles/chapter-38-fast-fluid-dynamics-simulation-gpu

### Documentation

- [FastAPI](https://fastapi.tiangolo.com)
- [SQLAlchemy](https://www.sqlalchemy.org)
- [MDN: WebGPU API](https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API)
- [W3C: WebGPU Standard](https://www.w3.org/TR/WGSL/)
- [W3C: WebGPU Shading Language Standard](https://www.w3.org/TR/webgpu/)