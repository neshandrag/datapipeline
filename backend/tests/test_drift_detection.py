import pandas as pd

from app.services.drift_detection import compare_datasets


def test_identical_datasets_show_no_drift(tmp_path):
    df = pd.DataFrame({"age": list(range(20, 50)), "score": [i * 1.5 for i in range(30)]})
    prev_path = tmp_path / "prev.csv"
    curr_path = tmp_path / "curr.csv"
    df.to_csv(prev_path, index=False)
    df.to_csv(curr_path, index=False)

    report = compare_datasets(str(prev_path), str(curr_path))
    assert report["drift_detected"] is False


def test_shifted_distribution_triggers_drift(tmp_path):
    prev = pd.DataFrame({"age": list(range(20, 50))})
    curr = pd.DataFrame({"age": [v + 100 for v in range(20, 50)]})
    prev_path = tmp_path / "prev.csv"
    curr_path = tmp_path / "curr.csv"
    prev.to_csv(prev_path, index=False)
    curr.to_csv(curr_path, index=False)

    report = compare_datasets(str(prev_path), str(curr_path))
    assert report["drift_detected"] is True
    assert any(d["column"] == "age" for d in report["feature_distribution_drift"])
