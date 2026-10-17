def test_root(client):
    res = client.get("/")
    assert res.status_code == 200
    assert res.json() == {"message": "Dataset Repair Platform API Running"}


def test_monitoring_stats_shape(client):
    res = client.get("/monitoring/stats")
    assert res.status_code == 200
    body = res.json()
    for key in [
        "upload_count", "failure_count", "average_quality_score",
        "average_repair_time_seconds", "average_processing_time_seconds",
        "total_events", "recent_events",
    ]:
        assert key in body


def test_registry_models_shape(client):
    res = client.get("/registry/models")
    assert res.status_code == 200
    assert "models" in res.json()
    assert isinstance(res.json()["models"], list)
