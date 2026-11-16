plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}

val acceptanceResources = layout.buildDirectory.dir("generated/acceptance-res")
val prepareAcceptanceCa by tasks.registering {
    val certificatePath = providers.gradleProperty("careerAcceptanceCa")
    inputs.property("certificatePath", certificatePath.orElse(""))
    outputs.dir(acceptanceResources)
    doLast {
        val path = certificatePath.orNull ?: error("Set -PcareerAcceptanceCa to the isolated fixture's public CA PEM.")
        val certificate = file(path).readText()
        require(certificate.contains("-----BEGIN CERTIFICATE-----") && !certificate.contains("PRIVATE KEY")) {
            "Only a public fixture CA certificate may be packaged for acceptance."
        }
        acceptanceResources.get().file("raw/acceptance_ca.pem").asFile.apply {
            parentFile.mkdirs()
            writeText(certificate)
        }
    }
}

android {
    namespace = "com.saleh.careerfinder"
    compileSdk = 36
    defaultConfig {
        applicationId = "com.saleh.careerfinder"
        minSdk = 26
        targetSdk = 36
        versionCode = 6
        versionName = "0.5.0"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }
    buildTypes {
        debug { applicationIdSuffix = ".preview" }
        release { isMinifyEnabled = false; isDebuggable = false }
        create("acceptance") {
            initWith(getByName("debug"))
            applicationIdSuffix = ".acceptance"
            versionNameSuffix = "-acceptance"
            matchingFallbacks += listOf("debug")
            resValue("string", "app_name", "Career Finder Acceptance")
        }
    }
    testBuildType = if (providers.gradleProperty("careerAcceptance").orNull == "true") "acceptance" else "debug"
    sourceSets.getByName("acceptance").res.srcDir(acceptanceResources)
    buildFeatures { compose = true }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

tasks.matching { it.name == "preAcceptanceBuild" }.configureEach { dependsOn(prepareAcceptanceCa) }

kotlin {
    compilerOptions { jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17) }
}

dependencies {
    val composeBom = platform("androidx.compose:compose-bom:2025.10.01")
    implementation(composeBom)
    androidTestImplementation(composeBom)
    implementation("androidx.activity:activity-compose:1.11.0")
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.compose.foundation:foundation")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-core")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.9.4")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.9.4")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.10.2")
    debugImplementation("androidx.compose.ui:ui-tooling")
    debugImplementation("androidx.compose.ui:ui-test-manifest")
    testImplementation("junit:junit:4.13.2")
    androidTestImplementation("androidx.test.ext:junit:1.3.0")
    androidTestImplementation("androidx.test:runner:1.7.0")
    androidTestImplementation("androidx.compose.ui:ui-test-junit4")
}
