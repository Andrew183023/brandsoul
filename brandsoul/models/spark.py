from pydantic import BaseModel, Field


class SparkTheme(BaseModel):
    primaryColor: str | None = None
    secondaryColor: str | None = None


class SparkPageSections(BaseModel):
    showCarousel: bool = False
    showPromotions: bool = False
    showNewArrivals: bool = False


class SparkOpeningHours(BaseModel):
    start: str = Field(..., min_length=5, max_length=5)
    end: str = Field(..., min_length=5, max_length=5)


class SparkModes(BaseModel):
    sales: bool = True
    service: bool = True
    scheduling: bool = False
    emergency: bool = False


class SparkEmergencyMode(BaseModel):
    enabled: bool = False
    autoStart: bool = False
    showUploadEarly: bool = True


class SparkCtaConfig(BaseModel):
    whatsappEnabled: bool = False
    whatsappNumber: str | None = None
    whatsappMessageTemplate: str | None = None
    showAfterEvidence: bool = True
    showOnCompletion: bool = True
    primaryText: str | None = None
    secondaryText: str | None = None


class SparkFeatures(BaseModel):
    products: bool = True
    services: bool = False
    scheduling: bool = False
    emergency: bool = False


class SparkServiceOffer(BaseModel):
    title: str | None = None
    summary: str | None = None
    label: str | None = None


class SparkSchedulingConfig(BaseModel):
    class SparkWeeklyAvailabilityDay(BaseModel):
        enabled: bool = False
        start: str | None = None
        end: str | None = None

    class SparkAttendanceModes(BaseModel):
        presencial: bool = False
        online: bool = False
        domicilio: bool = False

    enabled: bool = False
    title: str | None = None
    description: str | None = None
    serviceOptions: list[str] = Field(default_factory=list)
    durationMinutes: int | None = None
    availableDays: list[str] = Field(default_factory=list)
    availableHours: list[str] = Field(default_factory=list)
    weeklyAvailability: dict[str, SparkWeeklyAvailabilityDay] = Field(default_factory=dict)
    blockedDates: list[str] = Field(default_factory=list)
    blockedSlots: list[str] = Field(default_factory=list)
    slotIntervalMinutes: int | None = None
    attendanceMode: str | None = None
    attendanceModes: SparkAttendanceModes = Field(default_factory=SparkAttendanceModes)
    whatsappNotificationEnabled: bool = False
    whatsappNumber: str | None = None
    whatsappMessageTemplate: str | None = None
    manualConfirmation: bool = False


class SparkProfessionalCase(BaseModel):
    caseType: str | None = None
    context: str | None = None
    approach: str | None = None
    learning: str | None = None


class SparkProfessionalContent(BaseModel):
    title: str | None = None
    summary: str | None = None
    stance: str | None = None


class SparkProfessionalIdentity(BaseModel):
    headline: str | None = None
    principles: list[str] = Field(default_factory=list)


class SparkProfessionalGuidance(BaseModel):
    situationType: str | None = None
    initialResponse: str | None = None
    initialQuestions: list[str] = Field(default_factory=list)
    actionChecklist: list[str] = Field(default_factory=list)
    dataCollection: list[str] = Field(default_factory=list)
    orientationLimits: str | None = None
    communicationTone: str | None = None
    closingMessage: str | None = None
    playbooks: dict[str, dict] = Field(default_factory=dict)


class SparkProfessionalData(BaseModel):
    operationMode: str = "institutional"
    presentation: str | None = None
    practiceAreas: list[str] = Field(default_factory=list)
    differentials: list[str] = Field(default_factory=list)
    cases: list[SparkProfessionalCase] = Field(default_factory=list)
    contents: list[SparkProfessionalContent] = Field(default_factory=list)
    identity: SparkProfessionalIdentity | None = None
    guidance: SparkProfessionalGuidance | None = None


class SparkPayload(BaseModel):
    brandName: str = Field(default="Minha marca", min_length=1, max_length=140)
    logo: str | None = None
    tone: str = Field(default="divertido", min_length=1, max_length=40)
    power: str = Field(default="atração", min_length=1, max_length=40)
    businessModel: str = Field(default="product", min_length=1, max_length=40)
    brandType: str = Field(default="business", min_length=1, max_length=40)
    features: SparkFeatures = Field(default_factory=SparkFeatures)
    voiceStyle: str = Field(default="balanced", min_length=1, max_length=40)
    actMode: str = Field(default="seller", min_length=1, max_length=40)
    businessGoal: str = Field(default="volume", min_length=1, max_length=40)
    modes: SparkModes = Field(default_factory=SparkModes)
    emergencyType: str | None = Field(default=None, min_length=1, max_length=40)
    emergencyMode: SparkEmergencyMode = Field(default_factory=SparkEmergencyMode)
    ctaConfig: SparkCtaConfig = Field(default_factory=SparkCtaConfig)
    serviceOffers: list[SparkServiceOffer] = Field(default_factory=list)
    schedulingConfig: SparkSchedulingConfig | None = None
    professionalData: SparkProfessionalData | None = None
    businessDescription: str | None = None
    institutionalImage: str | None = None
    theme: SparkTheme | None = None
    pageSections: SparkPageSections | None = None
    carouselImages: list[str] = Field(default_factory=list)
    openingHours: SparkOpeningHours | None = None
    address: str | None = None
    city: str | None = None
    state: str | None = None
    deliveryAvailable: bool | None = None
    businessHours: str | None = None
    serviceRegion: str | None = None
    brandHighlight: str | None = None
    whatsapp: str | None = None
    email: str | None = None
    instagram: str | None = None
    facebook: str | None = None
    tiktok: str | None = None
    site: str | None = None
    contactInfo: str | None = None
