package com.saleh.careerfinder

internal object ProfileValidation {
    fun errors(profile: ProfileDraft): Map<String, String> = buildMap {
        fun add(key: String, error: String?) { if (error != null) put(key, error) }
        add("firstName", ProfileContract.textError(profile.firstName, "First or single name", 150))
        add("lastName", ProfileContract.textError(profile.lastName, "Last name", 150))
        add("phone", ProfileContract.textError(profile.phone, "Phone", 150))
        add("city", ProfileContract.textError(profile.city, "City", 150))
        add("headline", ProfileContract.textError(profile.headline, "Headline", 500))
        add("email", ProfileContract.emailError(profile.email))
        add("country", ProfileContract.countryError(profile.country))
        add("skills", ProfileContract.listError(profile.skills, "Skills", false))
        add("targetRoles", ProfileContract.listError(profile.targetRoles, "Target roles", false))
        add("targetCountries", ProfileContract.listError(profile.targetCountries, "Target countries", true))
        add("website", ProfileContract.websiteError(profile.website))
        if (profile.workModes.size > 3 || profile.workModes.any { it !in setOf("on-site", "hybrid", "remote") })
            put("workModes", "Choose on-site, hybrid or remote work.")
        if (profile.experienceLevel !in setOf("any", "entry", "mid", "senior")) put("experienceLevel", "Choose an experience level from the list.")
        if (profile.linkedin.isNotEmpty() && runCatching { BoundaryPolicy.linkedinProfileURL(profile.linkedin) }.isFailure)
            put("linkedin", "Use your HTTPS LinkedIn personal profile link, beginning with /in/.")
    }
    fun requireValid(profile: ProfileDraft) {
        require(errors(profile).isEmpty()) { errors(profile).values.joinToString(" ") }
    }
}
