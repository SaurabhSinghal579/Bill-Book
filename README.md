# Hisaab

A lightweight, Hindi-friendly daily billing app. Customer names, item names, prices, quantity options, bills, and bill items are stored in a local SQLite database. Bill totals are recalculated and validated by the backend before they are saved.

## Run locally

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python app.py
```

Open http://127.0.0.1:5000. On first run, add customers, items, quantity options, and units in **Apna data manage karein**. Enter customer, item, and unit names in English; their Hindi names are saved and can be edited there. Customer, item, and unit edits keep both English and Hindi fields available. Enter prices per kilogram: gram units calculate `quantity × price ÷ 1000`, while kilogram units calculate `quantity × price`. Select a unit before entering a price. From **Bill History**, download a bill as Excel (named with the customer and bill date) or delete it after confirming the prompt.

Use the theme button beside the profile badge to switch between dark and light themes. The selected theme is remembered in this browser. Use the **A−** and **A+** buttons in the header to scale the website between 80% and 140%; the selected size is also remembered.

The database is created at `instance/bills.sqlite3`. Keep this file backed up; it contains the business data. The app listens on localhost by default and is intended for one computer or a trusted local network, not direct public-internet deployment.
