.PHONY: help install build run dev test static serve-static publish replay docker clean

help:
	@echo "install   install backend + frontend dependencies"
	@echo "build     build the SPA into frontend/dist"
	@echo "run       serve API + built SPA on :8000"
	@echo "dev       run the API on :8000 (frontend separately: cd frontend && npm run dev)"
	@echo "test      run the backend test suite"
	@echo "static    build the static (GitHub Pages / shared hosting) export"
	@echo "publish   push the static build to the gh-pages branch"
	@echo "replay    serve a replay of the 2021 election on :8001"
	@echo "docker    build and run with docker compose"
	@echo "clean     remove build artefacts and the local database"

install:
	cd backend && python3 -m pip install -r requirements.txt
	cd frontend && npm install

build:
	cd frontend && npm run build

run: build
	cd backend && python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8000

static:
	cd frontend && VITE_STATIC=1 npm run build
	python3 backend/scripts/export_static.py --out static-export

serve-static: static
	python3 -m http.server 8020 --directory static-export

# Publish the snapshot to the gh-pages branch (works without GitHub Actions).
# BASE defaults to /ballotwatch-sa/; use BASE=/ for a custom domain.
publish:
	./scripts/publish_pages.sh

dev:
	cd backend && python3 -m uvicorn app.main:app --reload --port 8000

replay:
	cd backend && LGE_YEAR=2021 LGE_DATA_DIR=../data-replay python3 -m uvicorn app.main:app --port 8001

test:
	cd backend && python3 -m unittest discover -s tests -v

docker:
	docker compose up --build

clean:
	rm -rf frontend/dist frontend/node_modules/.vite data/election.sqlite3* data-replay
