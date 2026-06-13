import streamlit as st
from backend.orchestrator import run_demo

st.set_page_config(page_title="Pactum — B2B Procurement", layout="wide")

st.title("Pactum")
st.caption("Multi-agent B2B procurement negotiation layer")

with st.form("buyer_request_form"):
    raw_request = st.text_area(
        "Buyer Request",
        value="We need a GPU for an AI workstation. It should fit inside our compact case, not consume too much power, stay under €650, arrive within a week, and include warranty.",
        height=100,
    )
    region = st.selectbox("Region", ["Germany", "Austria", "Switzerland"])
    priority = st.selectbox("Priority", ["technical_fit", "budget", "delivery", "performance"])
    submitted = st.form_submit_button("Start Procurement")

if submitted:
    request = {
        "request_id": "REQ-001",
        "raw_request": raw_request,
        "region": region,
        "priority": priority,
    }

    with st.spinner("Running procurement agents..."):
        result = run_demo(request)

    st.success("Procurement complete.")

    col1, col2 = st.columns(2)

    with col1:
        st.subheader("Structured Requirements")
        st.json(result["structured_requirements"])

    with col2:
        st.subheader("Matched Suppliers")
        for s in result["matched_suppliers"]:
            st.metric(s["seller_name"], f"{s['match_score']:.0%}", s["reason"])

    st.subheader("Negotiation Timeline")
    for log in result["conversation_logs"]:
        speaker = log["speaker"].capitalize()
        badge = f"[{log['seller_name']}]" if "seller_name" in log else f"[{log['seller_id']}]"
        labels = " ".join(f"`{l}`" for l in log.get("pioneer_labels", []))
        st.markdown(f"**{badge} {speaker}** (round {log['round']}): {log['message']}  {labels}")

    st.subheader("Technical Validation")
    for v in result["validation_results"]:
        status_color = "green" if v["status"] == "passed" else "red"
        st.markdown(f":{status_color}[**{v['seller_id']}** — {v['status'].upper()} (score {v['score']}/100)]")
        if v["failed_constraints"]:
            for c in v["failed_constraints"]:
                st.markdown(f"  - {c}")

    st.subheader("Human Escalation")
    esc = result["escalation_result"]
    if esc.get("escalate"):
        st.warning(esc.get("reason", ""))
        approved = st.radio(esc.get("question_for_human", "Approve?"), ["Approve", "Reject"], index=0)

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
    import os
    if deal_card and os.path.exists(deal_card):
        st.subheader("Deal Card")
        st.image(deal_card, width=600)

    if result.get("demo_mode"):
        st.info("Running in DEMO_MODE — using saved fallback outputs.")
