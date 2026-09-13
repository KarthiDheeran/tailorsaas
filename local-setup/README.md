# Windows local setup

Technician setup happens once. The shop user then opens **Start Server.bat** each day.

Set the Supabase directory in `settings.cmd` (default `E:\TailorLocal\supabase-local`). Keep the batch files in this folder; create a desktop shortcut to Start Server instead of moving it.

| File | Purpose |
| --- | --- |
| 01 Check Requirements.bat | Check Node 22+, Git Bash, Docker and Compose. Windows/WSL/Docker installation and any required reboot are performed once by the technician. |
| 02 Prepare Supabase.bat | Download the pinned self-hosted configuration into a new folder, generate keys on first creation only, and pull images. Existing configuration and passwords are preserved. |
| 03 Start Database.bat | Start existing Linux containers and wait up to three minutes for health checks. |
| 04 Install Schema.bat | Install application migrations into an empty local database. Stops if tables already exist; do not repeat on an installed database. |
| 05 Create Admin.bat | Open local Studio and the admin SQL file. Technician creates the auth user with a private password, then runs the SQL once. This is a guided manual step. |
| 06 Build App.bat | Install app dependencies if missing, then create the separate production build. Repeat after code, local API URL or public-key changes. |
| Start Server.bat | Start Docker Desktop if needed, start existing database services, launch the saved app build and open the browser. No image pull, migration, password generation or rebuild. |
| Check Server.bat | Show container health and whether the app responds. |

On the current test machine, Supabase, the schema and admin already exist. **Only step 06 is needed to prepare the new daily launcher.** Do not rerun schema installation. Close the older app terminal before starting the new server.

The launcher uses `http://localhost:3102`, binds to this PC only, and reads local Supabase credentials without printing them or replacing the cloud `.env.local`. Keep Docker Desktop and the server window running. Ctrl+C stops the app; Docker database containers remain running. No batch file deletes data or resets database volumes.

If setup fails, stop at that step and keep the error. Interrupted secret generation leaves a marker and blocks automatic startup until a technician repairs configuration. If an existing `.env` came from an example rather than a completed setup, the technician must generate its keys before continuing; the script does not overwrite an existing environment file.

To create a customer distribution, run **Build Customer Package.bat** on the developer PC. It builds the app and saves a timestamped ZIP under `release`; `release/LATEST.txt` identifies the newest archive. Copy that ZIP to the customer PC and extract it. Its README explains prerequisites and the included one-time setup steps. The packaged Start Server.bat runs the compiled app without building or installing npm dependencies at the customer site. Configure the database folder in both `setup/settings.cmd` and `customer-config.json` if changing the default location.

Catalog import is deliberately deferred. Shop configuration, LAN addresses/HTTPS, backups and restore testing, and automatic unattended Windows-service startup remain separate setup work. Packaging excludes original application source and development environment files, but cannot guarantee code secrecy from a machine administrator.
