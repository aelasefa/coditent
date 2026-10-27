# Coditent Monitoring Stack: Prometheus + Grafana + Node Exporter

Welcome to your complete DevOps monitoring guide! This directory contains the complete observability stack for Coditent, supporting both local development and production hosting at `https://grafana.coditent.app`.

---

## 1. High-Level Architecture: Who Does What?

In modern cloud observability, monitoring is divided into three distinct responsibilities: **Collector**, **Storage**, and **Visualizer**.

```
                           +-------------------------------------+
                           |             Ubuntu Host             |
                           |    /proc, /sys, / (rootfs mounts)   |
                           +------------------+------------------+
                                              |
                                              v
                                     [ Node Exporter ]
                                     (Port 9100, internal)
                                              |
     [ Coditent Backend ]                     | (HTTP GET /metrics every 15s)
      FastAPI (Port 8001)                     |
     (/metrics, internal) <----+              |
                               |              |
                        (HTTP scrape)         |
                               |              |
                          +----+--------------+----+
                          |       Prometheus       |
                          |  (:9090, TSDB Storage) |
                          +-----------+------------+
                                      |
                               (PromQL queries)
                                      |
                          +-----------v------------+
                          |        Grafana         |
                          | (:3000, Web Dashboard) |
                          +-----------+------------+
                                      |
                           (Proxied over loopback)
                                      |
                          +-----------v------------+
                          |     Host Nginx Ingress | (Ports 80 & 443 with TLS cert
                          |  grafana.coditent.app  |  from Let's Encrypt / Certbot)
                          +------------------------+
```

| Component | Role | What it Does in Coditent |
| :--- | :--- | :--- |
| **Node Exporter** | **Collector** (Host) | A lightweight agent that reads Linux kernel metrics directly from `/proc`, `/sys`, and `/` and exposes them as plain text at `http://node-exporter:9100/metrics`. |
| **FastAPI (`observability.py`)** | **Collector** (App) | Uses `prometheus_client` to record bounded request counts and duration histograms, exposing them at `http://api:8001/metrics`. |
| **Prometheus** | **Storage & Poller** | Periodically calls (scrapes) the `/metrics` HTTP endpoints of all targets every 15 seconds. It appends the values with timestamps into its Time Series Database (TSDB) stored in the `monitoring_prometheus_data` volume. Configured with retention limits (`--storage.tsdb.retention.time=15d` and `--storage.tsdb.retention.size=5GB`) to safeguard EC2 disk space. |
| **Grafana** | **Visualizer** | Connects to Prometheus as a datasource, issues PromQL queries, and turns numeric time series into intuitive gauges, tables, and graphs. Configuration and dashboards are saved in the `monitoring_grafana_data` volume. Configured for production under `https://grafana.coditent.app/` with authentication enforced (`GF_AUTH_ANONYMOUS_ENABLED=false`). |
| **Host Nginx** | **TLS Ingress** | Runs on the Ubuntu host, terminates TLS via Let's Encrypt certificates, manages HTTP-to-HTTPS redirection, and proxies WebSocket traffic to Grafana Live. |

---

## 2. Container Networking & Docker DNS: Why `http://prometheus:9090`?

When Grafana queries Prometheus, it connects to `http://prometheus:9090` instead of `http://localhost:9090`:

1. **Every container has its own network namespace**: Inside the Grafana container, `localhost` (or `127.0.0.1`) refers strictly to the Grafana container itself! Prometheus is not running inside the Grafana container.
2. **Docker Embedded DNS**: Docker runs an internal DNS resolver at IP `127.0.0.11` on every user-defined bridge network (`coditent_network`).
3. **Automatic Service Discovery**: When Grafana makes a request to `http://prometheus:9090`, Docker's DNS server intercepts the name `prometheus` and resolves it to Prometheus's virtual container IP address.
4. **Localhost Ports (`127.0.0.1:3000`, `127.0.0.1:9090`)**: The port bindings in `compose.yml` are bound strictly to loopback (`127.0.0.1`). Neither Grafana nor Prometheus is exposed publicly on the internet. In production, host Nginx forwards traffic from `https://grafana.coditent.app` directly to `127.0.0.1:3000`. Node Exporter is kept strictly internal (`expose: ["9100"]`, no host port published).

---

## 3. Worker Architecture & Python Metric Concurrency

In Python web applications, how your application server is started dictates how Prometheus metrics must be handled:

- **Single Worker (Current Setup)**:
  In `docker-compose.yml`, Uvicorn is launched as:
  ```bash
  uvicorn app.main:app --host 0.0.0.0 --port 8001 --no-access-log
  ```
  Because no `--workers` flag is specified, Uvicorn runs as a **single Python process**. Metrics in `app.observability` live in process memory, and every Prometheus scrape reaches this same process.
- **Multi-Worker Considerations (`--workers N`)**:
  If you scale Uvicorn to run multiple worker processes (e.g. `--workers 4`), each process has its own separate memory space. If Prometheus scrapes `/metrics`, each scrape would hit a random worker, causing graphs to jump erratically. To support multi-process workers in production, you would configure `prometheus_client` in multiprocess mode using the `PROMETHEUS_MULTIPROC_DIR` environment variable with shared memory (`/dev/shm`).

---

## 4. Quickstart: Startup & Shutdown

### Starting Monitoring
To load the Grafana administrator password from Vault and then start Prometheus,
Grafana, and Node Exporter:
```bash
cd /opt/coditent              # or local repo path
./scripts/run_monitoring.sh
```

### Stopping Monitoring
To stop the monitoring containers without deleting your dashboards or metric history:
```bash
cd /opt/coditent/monitoring
docker compose down
```
> [!NOTE]
> `docker compose down` stops and removes containers and networks, but preserves your named volumes (`monitoring_prometheus_data` and `monitoring_grafana_data`).

### Checking Logs
```bash
# View all logs
docker compose logs -f

# View Prometheus target scrape errors specifically
docker compose logs prometheus
```

---

## 5. Web Access & URLs

| Service | Address | Access Level | Description |
| :--- | :--- | :--- | :--- |
| **Production Grafana** | [https://grafana.coditent.app](https://grafana.coditent.app/) | Authenticated HTTPS | Public reverse proxy endpoint terminated by Host Nginx. Anonymous access disabled. |
| **Local Grafana** | [http://127.0.0.1:3000](http://127.0.0.1:3000) | Localhost loopback | Direct local development access. |
| **Prometheus** | [http://127.0.0.1:9090](http://127.0.0.1:9090) | Localhost loopback | PromQL query console and target health monitor. |
| **Prometheus Targets** | [http://127.0.0.1:9090/targets](http://127.0.0.1:9090/targets) | Localhost loopback | Displays live status of `prometheus`, `node-exporter`, and `coditent-api`. |
| **Host Node Exporter** | *Internal only* (`node-exporter:9100`) | Network internal | Kept off host ports for security; scraped by Prometheus. |
| **API Metrics Endpoint** | `http://127.0.0.1:8001/metrics` | Localhost loopback | Direct local access; blocked from public Nginx proxy. |

---

## 6. Authentication & Admin Credentials

- **Anonymous Access**: `GF_AUTH_ANONYMOUS_ENABLED=false`. All users must log in.
- **Administrator credential**: `GF_SECURITY_ADMIN_PASSWORD` is required by
  `monitoring/compose.yml` and loaded by `scripts/run_monitoring.sh` from the same
  Vault bundle as the application secrets. The launcher rejects values shorter than
  16 characters. Never place this credential in `.env` or Git.
- **Admin Password Reset**:
  Grafana's environment variable `GF_SECURITY_ADMIN_PASSWORD` only takes effect when initializing an *empty* database on the very first container run. Once `/var/lib/grafana/grafana.db` exists, changing that variable in `compose.yml` does **not** change the existing admin account password.
  To reset the Grafana admin password on an existing installation:
  ```bash
  docker exec -it monitoring-grafana-1 grafana-cli admin reset-admin-password <new_secure_password>
  ```

---

## 7. Dashboard PromQL Queries Explained

Our provisioned dashboard (**Coditent System & Backend Overview**) includes dedicated panels with strict health probe isolation:

### 1. Prometheus Scrape Status by Target
- **Query**: `up`
- **Unit**: None (Value mapping: `1` = UP [green], `0` = DOWN [red])
- **Mentor Concept (Availability vs Health)**:
  `up == 1` confirms that Prometheus was able to establish an HTTP connection and parse the `/metrics` endpoint. **Scrape availability does not mean the application is healthy.** For example, an API might be actively failing database connections while its `/metrics` endpoint is still `up == 1`.

### 2. Application Readiness Probe
- **Query**: `(sum(rate(http_requests_total{job="coditent-api",path="/ready",status_code="200"}[2m])) > bool 0) and on() (up{job="coditent-api"} == 1)`
- **Unit**: None (Value mapping: `1` = READY (200) [green], `0` = DEGRADED (503) [red])
- **Explanation**: Tracks the real health of the application's dependencies (PostgreSQL, Redis, Celery Worker, AI Dispatcher). If dependencies fail, `/ready` returns 503 and the panel turns red. If the target is unreachable, the panel cleanly reports No Data.

### 3. User-Facing Requests per Second
- **Query**: `sum(rate(http_requests_total{job="coditent-api",path!~"/ready|/metrics|/health"}[1m])) by (method, status_code)`
- **Unit**: Requests/sec (`reqps`)
- **Explanation**: Computes per-second rate of change over a 1-minute window, grouping by HTTP method and status code. **Health and telemetry routes (`/ready`, `/metrics`, `/health`) are explicitly excluded** to prevent probe polling from masking real user traffic trends.

### 4. User-Facing 5xx Error Percentage
- **Query**: `(((sum(rate(http_requests_total{job="coditent-api",path!~"/ready|/metrics|/health",status_code=~"5.."}[5m])) / (sum(rate(http_requests_total{job="coditent-api",path!~"/ready|/metrics|/health"}[5m])) > 0)) * 100)) or (0 * (up{job="coditent-api"} == 1))`
- **Unit**: Percent (`0 - 100%`)
- **Explanation**: Divides the 5-minute rate of user-facing 5xx errors by total user-facing requests. The fallback `or (0 * (up{job="coditent-api"} == 1))` ensures:
  - During idle periods when traffic is 0 and the target is UP, the panel reports `0%`.
  - When the target is DOWN or missing, the panel displays **No Data** instead of falsely showing 0%.

### 5. User-Facing p95 Request Duration
- **Query**: `histogram_quantile(0.95, sum(rate(http_request_latency_seconds_bucket{job="coditent-api",path!~"/ready|/metrics|/health"}[5m])) by (le))`
- **Unit**: Seconds (`s`)
- **Explanation**: Calculates the 95th percentile latency from histogram buckets for user requests only.

### 6. Host CPU Usage
- **Query**: `(1 - avg(rate(node_cpu_seconds_total{mode="idle"}[1m]))) * 100`
- **Unit**: Percent (`0 - 100%`)
- **Explanation**: Subtracts idle CPU time across all cores from 100% to measure busy CPU percentage.

### 7. Host Memory Usage
- **Query**: `(1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)) * 100`
- **Unit**: Percent (`0 - 100%`)
- **Explanation**: Uses `MemAvailable` rather than `MemFree`. Linux caches disk buffers in RAM, so `MemFree` is misleading; `MemAvailable` reflects memory truly reclaimable for apps.

### 8. Host Root Filesystem Usage
- **Query**: `100 - ((node_filesystem_avail_bytes{mountpoint="/"} / node_filesystem_size_bytes{mountpoint="/"}) * 100)`
- **Unit**: Percent (`0 - 100%`)
- **Explanation**: Node Exporter uses `--path.rootfs=/rootfs` to inspect the host root disk.

---

## 8. Prometheus Alerting Rules

Alerting rules are located in [`monitoring/alerting_rules.yml`](alerting_rules.yml):

| Alert Name | Severity | Threshold Condition | Evaluation Time | Description |
| :--- | :--- | :--- | :--- | :--- |
| **`TargetDown`** | `critical` | `up == 0` | 2 minutes | Fires if Prometheus cannot scrape any configured target (`prometheus`, `node-exporter`, or `coditent-api`). |
| **`BackendReadinessFailed`** | `critical` | `(sum(rate(http_requests_total{job="coditent-api",path="/ready",status_code!="200"}[5m])) > 0) or ...` | 3 minutes | Fires if the backend readiness probe returns non-200 responses or fails to report for 3 minutes (database, redis, or worker failure). |
| **`HighHttp5xxErrorRate`** | `warning` | User-facing 5xx error percentage `> 5%` | 5 minutes | Fires if more than 5% of legitimate user requests return HTTP 5xx errors over a 5-minute window. |
| **`HostDiskSpaceLow`** | `warning` | Root filesystem usage `> 85%` | 5 minutes | Fires if host root filesystem disk usage exceeds 85% (less than 15% free disk remaining). |
| **`HostHighMemoryUsage`** | `warning` | Host RAM usage `> 90%` | 10 minutes | Fires if host available memory drops below 10% for more than 10 minutes. |

> [!NOTE]
> Alert notification destinations (e.g., Slack webhook, PagerDuty, or email) can be wired using Prometheus Alertmanager upon providing the target webhook channel.

---

## 9. Backup and Rollback Procedures

### Backing Up Monitoring Data
To create an archive of Prometheus time series and Grafana dashboards/users before making changes:
```bash
# 1. Stop monitoring services
docker compose -f /opt/coditent/monitoring/compose.yml stop

# 2. Backup Grafana database volume
docker run --rm \
  -v monitoring_grafana_data:/data \
  -v /opt/coditent/backups:/backup \
  alpine tar czf /backup/grafana_data_$(date +%Y%m%d_%H%M%S).tar.gz -C /data .

# 3. Backup Prometheus TSDB volume
docker run --rm \
  -v monitoring_prometheus_data:/data \
  -v /opt/coditent/backups:/backup \
  alpine tar czf /backup/prometheus_data_$(date +%Y%m%d_%H%M%S).tar.gz -C /data .

# 4. Restart services
docker compose -f /opt/coditent/monitoring/compose.yml start
```

### Restoring Monitoring Data
```bash
# Restore Grafana volume from backup
docker run --rm \
  -v monitoring_grafana_data:/data \
  -v /opt/coditent/backups:/backup \
  alpine sh -c "rm -rf /data/* && tar xzf /backup/<BACKUP_FILE>.tar.gz -C /data"
```

### Rollback Procedure
If a deployment fails or needs to be rolled back:
1. Revert Nginx configuration:
   ```bash
   rm -f /etc/nginx/sites-enabled/grafana.conf
   nginx -t && systemctl reload nginx
   ```
2. Revert monitoring compose to the previous git commit:
   ```bash
   git checkout <PREVIOUS_COMMIT> -- monitoring/
   docker compose -f /opt/coditent/monitoring/compose.yml up -d --force-recreate
   ```

---

## 10. Ansible Deployment Automation

### Running Locally (Development Environment)
To deploy and verify the monitoring stack on your local Ubuntu machine:
```bash
# Using the deploy helper
bash ansible/deploy.sh monitoring local

# Or directly with ansible-playbook
ansible-playbook -i ansible/inventory/hosts.ini ansible/playbooks/monitoring.yml --limit local
```

### Running on Production (`coditent-prod` / AWS EC2: 34.205.255.37)
To deploy the monitoring stack and Nginx reverse proxy to AWS EC2:
```bash
# With your AWS EC2 SSH key:
ansible-playbook -i ansible/inventory/hosts.ini ansible/playbooks/monitoring.yml --limit production --private-key ~/.ssh/your-aws-key.pem

# Or using the deploy helper:
bash ansible/deploy.sh monitoring production --private-key ~/.ssh/your-aws-key.pem
```

> [!NOTE]
> **Troubleshooting `Permission denied (publickey)` on EC2 (`34.205.255.37`)**:
> If running against `production` fails with `Permission denied (publickey)`:
> 1. Ensure you pass your EC2 private key with `--private-key /path/to/key.pem` or set `ansible_ssh_private_key_file` in `ansible/inventory/hosts.ini`.
> 2. Alternatively, append your local public key (`~/.ssh/id_ed25519.pub`) into `/home/ubuntu/.ssh/authorized_keys` on the EC2 server.
> 3. For local development on your Ubuntu machine, always use `--limit local`.
