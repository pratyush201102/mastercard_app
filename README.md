# Stage 6 What-If Simulator

This app turns your tract-level SHAP CSV into an interactive simulation.

## What it does

- Lets you select a census tract.
- Detects the top 3 negative SHAP features for that tract.
- Provides sliders (0-15 percentile points) to model realistic 2-3 year improvements.
- Estimates Health Insurance Coverage score lift from SHAP recovery.
- Converts projected coverage gain into additional insured residents using tract population.

## Run locally

From this folder:

```bash
python3 server.py
```

Then open:

- http://localhost:8000/index.html

If the default CSV does not load automatically, click **Load another CSV** and choose your file.

The app now loads tract data from the backend endpoint at `/api/tract-data`,
which uses Python's CSV parser for better tolerance of malformed quoted fields.

## Free hosting (shareable URL)

You can deploy this app for free on Render.

1. Push this project to a GitHub repository.
2. Sign in to Render and click New +, then Blueprint.
3. Select your repository.
4. Render will detect `render.yaml` and create the web service automatically.
5. Wait for deploy to complete, then open the generated URL and share it.

Notes:

- This server now reads host and port from environment variables, so it works on Render.
- The free tier can sleep after inactivity; first request after sleep may take a few seconds.

## Default assumptions used in the UI

- Recovery per factor: `abs(negative_shap) * (slider_points / 15)`
- Score lift: sum of recoveries for top negative SHAP factors
- Coverage translation: 1 score point ~= +1 percentage point in insured rate

You can explain this as a conservative, transparent approximation for judging scenarios when full model coefficients are not deployed in-browser.
