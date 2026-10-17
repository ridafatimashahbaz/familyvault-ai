import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  SPEECH_LANGUAGES,
  SPEECH_LOCALES,
  WHISPER_LANGUAGES,
  WHISPER_MODELS,
  isSpeechLanguage,
  normaliseTranscript,
} from "@/lib/voice/speech";
import { INTENT_QUESTIONS, classifyIntent } from "@/lib/voice/intent";
import { canUseOnDeviceModel } from "@/lib/voice/whisper";
import { speechErrorCode } from "@/components/voice/use-speech-recognition";
import { selectVoice } from "@/components/voice/use-speech-synthesis";

/** Builds a minimal SpeechSynthesisVoice stand-in for selection tests. */
function voice(name: string, lang: string): SpeechSynthesisVoice {
  return { name, lang, default: false, localService: true, voiceURI: name } as SpeechSynthesisVoice;
}

describe("speech languages", () => {
  test("every speech language has a locale and a Whisper name", () => {
    for (const language of SPEECH_LANGUAGES) {
      assert.match(SPEECH_LOCALES[language], /^[a-z]{2}-[A-Z]{2}$/);
      assert.equal(typeof WHISPER_LANGUAGES[language], "string");
      assert.ok(WHISPER_LANGUAGES[language].length > 0);
    }
  });

  test("Urdu maps to the RTL locale the browser needs", () => {
    assert.equal(SPEECH_LOCALES.ur, "ur-PK");
    assert.equal(WHISPER_LANGUAGES.ur, "urdu");
  });

  test("isSpeechLanguage accepts the three languages and nothing else", () => {
    assert.ok(isSpeechLanguage("en"));
    assert.ok(isSpeechLanguage("ur"));
    assert.ok(isSpeechLanguage("pa"));
    assert.ok(!isSpeechLanguage("fr"));
    assert.ok(!isSpeechLanguage(undefined));
  });

  test("the default model is the quantised multilingual checkpoint", () => {
    assert.equal(WHISPER_MODELS.base, "onnx-community/whisper-base");
    assert.notEqual(WHISPER_MODELS.base, WHISPER_MODELS.tiny);
  });
});

describe("normaliseTranscript", () => {
  test("collapses whitespace and trims", () => {
    assert.equal(normaliseTranscript("  what   expires  soon "), "what expires soon");
  });

  test("strips zero-width and bidi control characters", () => {
    assert.equal(normaliseTranscript("pass\u200Bport\u202E"), "passport");
  });

  test("leaves Urdu text intact", () => {
    assert.equal(normaliseTranscript("میعاد کب ختم"), "میعاد کب ختم");
  });
});

describe("on-device speech availability", () => {
  test("fails closed outside a browser (no cloud fallback)", () => {
    // Under Node there is no MediaRecorder/AudioContext/getUserMedia, so the
    // on-device path must report unavailable rather than silently degrade.
    assert.equal(canUseOnDeviceModel(), false);
  });
});

describe("speechErrorCode", () => {
  test("maps a denied microphone permission to not-allowed", () => {
    assert.equal(speechErrorCode(new DOMException("Permission denied", "NotAllowedError")), "not-allowed");
  });

  test("maps a browser security restriction to not-allowed", () => {
    assert.equal(speechErrorCode(new DOMException("Insecure context", "SecurityError")), "not-allowed");
    assert.equal(speechErrorCode({ name: "PermissionDeniedError", message: "" }), "not-allowed");
  });

  test("falls back to unsupported for anything else", () => {
    assert.equal(speechErrorCode(new Error("No audio device")), "unsupported");
    assert.equal(speechErrorCode(undefined), "unsupported");
    assert.equal(speechErrorCode(""), "unsupported");
  });
});

describe("selectVoice", () => {
  test("prefers en-US then en-GB for English", () => {
    const enGB = voice("Google UK English", "en_GB");
    const enUS = voice("Google US English", "en-US");
    const enAU = voice("Karen", "en-AU");
    assert.equal(selectVoice([enGB, enAU], "en")?.name, "Google UK English");
    assert.equal(selectVoice([enAU, enUS, enGB], "en")?.name, "Google US English");
  });

  test("prefers ur-PK then ur-IN for Urdu, and reports none when absent", () => {
    const urIN = voice("Urdu India", "ur-IN");
    const urPK = voice("Urdu Pakistan", "ur_PK");
    assert.equal(selectVoice([urIN], "ur")?.name, "Urdu India");
    assert.equal(selectVoice([urIN, urPK], "ur")?.name, "Urdu Pakistan");
    assert.equal(selectVoice([voice("Google US English", "en-US")], "ur"), undefined);
  });

  test("falls back to any voice matching the language prefix", () => {
    const generic = voice("Urdu", "ur");
    assert.equal(selectVoice([generic], "ur")?.name, "Urdu");
  });
});

describe("classifyIntent", () => {
  test("recognises an explicit request to explain, in both languages", () => {
    assert.equal(classifyIntent("explain this"), "understand");
    assert.equal(classifyIntent("اس دستاویز کو سمجھاؤ"), "understand");
  });

  test("recognises expiry questions", () => {
    assert.equal(classifyIntent("which documents are expiring soon?"), "expiry");
    assert.equal(classifyIntent("میعاد کب ختم ہو گی"), "expiry");
  });

  test("recognises counting questions", () => {
    assert.equal(classifyIntent("how many documents do I have"), "count");
    assert.equal(classifyIntent("کتنے دستاویزات ہیں"), "count");
  });

  test("falls back to a plain question", () => {
    assert.equal(classifyIntent("what is the passport number"), "ask");
    assert.equal(classifyIntent(""), "ask");
  });

  test("only understand and expiry map to an automatic question", () => {
    assert.ok(INTENT_QUESTIONS.understand);
    assert.ok(INTENT_QUESTIONS.expiry);
    assert.equal(INTENT_QUESTIONS.count, null);
    assert.equal(INTENT_QUESTIONS.ask, null);
  });
});
