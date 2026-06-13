import os
import streamlit as st
from backend.orchestrator import run_demo
from backend.data_access import get_buyer_scenarios

st.set_page_config(page_title="Pactum — B2B Procurement", layout="wide")

st.title("Pactum")
st.caption("Multi-agent B2B procurement negotiation layer")

# Scenario selector — outside the form so changing it rerenders the text area
@st.cache_data
def _load_scenarios():
    return get_buyer_scenarios()

scenarios = _load_scenarios()
scenario_map = {s["request_id"]: s for s in scenarios}

selector_options = ["Custom request"] + [
    f"{s['request_id']} — {s.get('structured_requirements', {}).get('use_case', s['request_id'])}"
    for s in scenarios
]
selected_label = st.selectbox("Demo Scenario", selector_options)

if selected_label == "Custom request":
    selected_request_id = ""
    default_text = (
        "We need a GPU for an AI workstation. It should fit inside our compact case, "
        "not consume too much power, stay under €650, arrive within a week, and include warranty."
    )
else:
    selected_request_id = selected_label.split(" — ")[0]
    default_text = scenario_map.get(selected_request_id, {}).get("raw_request", "")

with st.form("buyer_request_form"):
    # key changes when scenario changes, forcing value to reset
    raw_request = st.text_area("Buyer Request", value=default_text, height=100, key=selected_label)
    region = st.selectbox("Region", ["Germany", "Austria", "Switzerland"])
    priority = st.selectbox("Priority", ["technical_fit", "budget", "delivery", "performance"])
    submitted = st.form_submit_button("Start Procurement")

if submitted:
    request = {"raw_request": raw_request, "region": region, "priority": priority}
    if selected_request_id:
        request["request_id"] = selected_request_id

    with st.spinner("Running procurement agents..."):
        st.session_state["result"] = run_demo(request)
    st.session_state.pop("approval", None)  # clear stale approval from previous run

# Render from session_state so the page never resets when judge clicks the approval radio
if "result" in st.session_state:
    result = st.session_state["result"]

    st.success("Procurement complete.")

    col1, col2 = st.columns(2)

    with col1:
        st.subheader("Structured Requirements")
        st.json(result["structured_requirements"])

    with col2:
        st.subheader("Matched Suppliers")
        for s in result["matched_suppliers"]:
            st.metric(s["seller_name"], f"{s['match_score']:.0%}")
            st.caption(s["reason"])

    st.subheader("Negotiation Timeline")
    for log in result["conversation_logs"]:
        speaker = log["speaker"].capitalize()
        badge = f"[{log['seller_name']}]" if "seller_name" in log else f"[{log['seller_id']}]"
        pioneer_labels = log.get("pioneer_labels") or []
        labels = ("  " + " ".join(f"`{l}`" for l in pioneer_labels)) if pioneer_labels else ""
        risk = log.get("risk_level", "")
        risk_md = f" _{risk} risk_" if risk and risk != "low" else ""
        st.markdown(f"**{badge} {speaker}** (round {log['round']}): {log['message']}{labels}{risk_md}")

    st.subheader("Technical Validation")
    seller_names = {s["seller_id"]: s["seller_name"] for s in result["matched_suppliers"]}
    for v in result["validation_results"]:
        display_name = seller_names.get(v["seller_id"], v["seller_id"])
        status_color = "green" if v["status"] == "passed" else "red"
        st.markdown(f":{status_color}[**{display_name}** — {v['status'].upper()} (score {v['score']}/100)]")
        if v["failed_constraints"]:
            for c in v["failed_constraints"]:
                st.markdown(f"  - {c}")

    st.subheader("Human Escalation")
    esc = result["escalation_result"]
    if esc.get("escalate"):
        st.warning(esc.get("reason", ""))
        approval = st.radio(
            esc.get("question_for_human", "Approve?"),
            ["Approve", "Reject"],
            index=None,
            key="approval",
        )
        if approval == "Approve":
            rec = result["final_recommendation"]
            st.success(
                f"Approved — purchase order would be issued to "
                f"**{rec.get('recommended_seller', 'selected vendor')}** "
                f"for {rec.get('recommended_product', '')} at €{rec.get('price_eur', '')}."
            )
        elif approval == "Reject":
            st.warning("Rejected — recommendation returned to procurement for re-negotiation.")

    st.subheader("Audit Summary")
    st.text(result["audit_summary"])

    st.subheader("Final Recommendation")
    rec = result["final_recommendation"]
    if rec.get("recommended_seller"):
        st.success(
            f"**{rec['recommended_seller']}** — {rec['recommended_product']}  \n"
            f"€{rec['price_eur']} · {rec['delivery_days']} days · {rec['technical_status']} · risk: {rec['risk_level']}"
        )
        st.caption(rec.get("reason", ""))
    else:
        st.error("No compatible offer found.")

    deal_card = result.get("deal_card_path", "")
    if deal_card and os.path.exists(deal_card):
        st.subheader("Deal Card")
        st.image(deal_card, width=600)

    if result.get("demo_mode"):
        st.info("Running in DEMO_MODE — using saved fallback outputs.")
