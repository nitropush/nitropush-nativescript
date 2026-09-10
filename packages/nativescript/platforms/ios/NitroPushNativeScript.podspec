Pod::Spec.new do |s|
  s.name = 'NitroPushNativeScript'
  s.version = '0.1.0-alpha.0'
  s.summary = 'NitroPush native update engine and NativeScript boot adapter'
  s.homepage = 'https://github.com/nitropush/nitropush-nativescript'
  s.license = 'MIT'
  s.author = 'NitroPush'
  s.source = { :git => 'https://github.com/nitropush/nitropush-nativescript.git', :tag => s.version.to_s }
  s.platform = :ios, '15.0'
  s.swift_version = '5.0'
  s.source_files = '**/*.{swift,c,h}'
  s.libraries = 'bz2'
  s.frameworks = 'Foundation', 'UIKit', 'CryptoKit'
end
