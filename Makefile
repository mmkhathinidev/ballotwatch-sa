.PHONY: help install build run dev test test-backend lint docker clean

help:
	@echo "install   install backend + frontend dependencies"
	@echo "build     build the SPA into frontend/dist"
	@echo "run       serve API + built SPA on :8000"
	@echo "dev       run the API on :8000 (frontend separately: cd frontend && npm run dev)"
	@echo "test      run the backend test suite"
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
