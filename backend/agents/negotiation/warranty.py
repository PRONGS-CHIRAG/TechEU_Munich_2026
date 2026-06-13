def get_warranty_context(requirements: dict, product: dict, seller: dict) -> str:
    min_warranty = requirements.get("minimum_warranty_years", 1)
    warranty = product.get("warranty_years", 0)
    delta = warranty - min_warranty
    if delta < 0:
        return (
            f"Warranty is {warranty} years, below the required {min_warranty} years by {abs(delta):.1g} years. "
            f"Request an extended warranty or a written SLA commitment before accepting."
        )
    return (
        f"Warranty is {warranty} years, meeting the {min_warranty}-year requirement. "
        f"Confirm that warranty covers on-site replacement and includes parts and labor."
    )
