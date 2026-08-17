# AI Business Analyst — Test Scenarios

Start at **Overview** and select **Use sample sales data**. Then open **AI Analyst**. The application will create a private sample dataset with 224 sales orders spanning January through August 2026.

| # | Question to ask | What to inspect |
| --- | --- | --- |
| 1 | What is our total revenue? | A KPI result with executed aggregate SQL. |
| 2 | Show monthly revenue for 2026. | A backend-driven monthly line chart. |
| 3 | Which product category has the highest profit? | A ranked category chart and result. |
| 4 | Compare revenue between Cairo and Alexandria. | A city comparison with data-driven values. |
| 5 | What are our top 10 products by revenue? | A limited product-ranking query. |
| 6 | Is revenue increasing or decreasing over time? | The monthly trend and evidence-based interpretation. |
| 7 | Why did revenue decrease in July? | The June-versus-July category root-cause breakdown. |
| 8 | Which region contributes the most revenue? | Geographic grouping and ranking. |
| 9 | What is the average order value by sales channel? | Channel comparison with average calculation. |
| 10 | Which customers are most valuable by profit? | Customer segmentation. |
| 11 | How much revenue did we generate in Cairo? | A deterministic city filter in the SQL `WHERE` clause. |
| 12 | Which category has the strongest profit margin? | Margin calculation and category comparison. |
| 13 | Are there unusual sales patterns by month? | Statistical screening plus chart payload. |
| 14 | How does July compare with June? | Follow-up memory and a period-comparison query. |
| 15 | What should management focus on next month? | Evidence-limited business recommendation. |
| 16 | Show the distribution of order revenue. | A histogram generated from the query result. |

For each response, expand the exact **Analysis Details** control. Confirm the generated SQL is a single `SELECT` or CTE scoped to `dataset`, the tool list includes the expected execution stages, the referenced columns are visible, and the result preview corresponds to the chart. You can save a completed answer to **Saved Insights** and review it in **Analysis History**.
