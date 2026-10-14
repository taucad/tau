# Data-only distribution of the canonical JSON. This module creates no resources,
# needs no provider or credentials, and is consumed at an immutable Git commit.
terraform {
  required_version = ">= 1.5.0"
}

output "contract_version" {
  description = "Version of the dashboard and alert binding contract."
  value       = 1
}

output "dashboard_json" {
  description = "Canonical dashboards, indexed by filename without extension."
  value = {
    for name in fileset("${path.module}/../dashboards", "*.json") :
    trimsuffix(name, ".json") => file("${path.module}/../dashboards/${name}")
  }
}

output "alert_group_json" {
  description = "Canonical alert groups; app=~\".*\" is the local scope binding."
  value = {
    for name in fileset("${path.module}/../alerts", "*.json") :
    trimsuffix(name, ".json") => file("${path.module}/../alerts/${name}")
  }
}
