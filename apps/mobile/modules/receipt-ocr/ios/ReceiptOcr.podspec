Pod::Spec.new do |s|
  s.name           = 'ReceiptOcr'
  s.version        = '1.0.0'
  s.summary        = 'On-device text recognition for receipt photos (Apple Vision).'
  s.description    = 'Recognises the text of a receipt photo and finds the outline of the paper with the Vision framework.'
  s.license        = 'MIT'
  s.author         = 'Ortak Kasa'
  s.homepage       = 'https://github.com/zeynepbass/shared.safe'
  s.platforms      = {
    :ios => '16.4'
  }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.frameworks = 'Vision'

  s.source_files = "**/*.{h,m,swift}"
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end
