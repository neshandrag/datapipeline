def test_upload_valid_csv(client, sample_csv):
    with open(sample_csv, "rb") as f:
        res = client.post("/upload", files={"file": ("pytest_sample.csv", f, "text/csv")})
    assert res.status_code == 200
    body = res.json()
    assert body["filename"] == "pytest_sample.csv"
    assert body["validation"]["status"] == "Valid"
    assert body["validation"]["rows"] == 15


def test_upload_rejects_non_csv(client, tmp_path):
    bad_file = tmp_path / "notes.txt"
    bad_file.write_text("not a csv")
    with open(bad_file, "rb") as f:
        res = client.post("/upload", files={"file": ("notes.txt", f, "text/plain")})
    assert res.status_code == 400


def test_profile_after_upload(client, sample_csv):
    with open(sample_csv, "rb") as f:
        client.post("/upload", files={"file": ("pytest_profile.csv", f, "text/csv")})

    res = client.get("/profile/pytest_profile.csv")
    assert res.status_code == 200
    assert "profile" in res.json()


def test_repair_runs_full_pipeline(client, sample_csv):
    with open(sample_csv, "rb") as f:
        client.post("/upload", files={"file": ("pytest_repair.csv", f, "text/csv")})

    res = client.post("/repair/pytest_repair.csv?outlier_strategy=clip")
    assert res.status_code == 200
    body = res.json()
    assert "quality_before" in body
    assert "quality_after" in body
    assert body["quality_after"] >= 0


def test_repair_missing_file_returns_404(client):
    res = client.post("/repair/does_not_exist_ever.csv")
    assert res.status_code == 404
