import React, { useRef, useState, useEffect, forwardRef, useImperativeHandle } from 'react';
import { useFrame, useLoader } from '@react-three/fiber';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import * as THREE from 'three';

// Professional tutor avatar - using a working model URL
const AVATAR_URL = 'https://market-assets.fra1.cdn.digitaloceanspaces.com/market-assets/models/polysample-model/model.glb';

const Avatar3D = forwardRef(({ isSpeaking, mood, onLoad }, ref) => {
  const avatarRef = useRef();
  const mixerRef = useRef();
  const idleActionRef = useRef();
  const talkActionRef = useRef();
  const blinkActionRef = useRef();
  const [model, setModel] = useState(null);
  const [morphTargets, setMorphTargets] = useState({});
  const mouthOpenRef = useRef(0);
  
  // Expose methods to parent components
  useImperativeHandle(ref, () => ({
    setMouthOpenness: (value) => {
      mouthOpenRef.current = value;
    }
  }));
  
  // Load the avatar model with error handling
  const [gltf, setGltf] = useState(null);
  const [loadError, setLoadError] = useState(false);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    let isMounted = true;
    
    const loadModel = async () => {
      try {
        const loader = new GLTFLoader();
        console.log('Loading avatar model from:', AVATAR_URL);
        
        loader.load(
          AVATAR_URL,
          (loadedGltf) => {
            if (isMounted) {
              console.log('Avatar model loaded successfully');
              setGltf(loadedGltf);
              setLoadError(false);
              setLoading(false);
            }
          },
          (progress) => {
            // Progress callback
            console.log('Loading progress:', (progress.loaded / progress.total * 100).toFixed(2) + '%');
          },
          (error) => {
            console.error('Failed to load primary avatar model:', error);
            if (isMounted) {
              // Try fallback model
              const fallbackUrl = 'https://threejs.org/examples/models/gltf/LeePerrySmith/LeePerrySmith.glb';
              console.log('Trying fallback model:', fallbackUrl);
              
              loader.load(
                fallbackUrl,
                (fallbackGltf) => {
                  if (isMounted) {
                    console.log('Fallback model loaded successfully');
                    setGltf(fallbackGltf);
                    setLoadError(false);
                    setLoading(false);
                  }
                },
                undefined,
                (fallbackError) => {
                  console.error('Failed to load fallback avatar model:', fallbackError);
                  if (isMounted) {
                    // Fallback to a simple box if all models fail to load
                    setLoadError(true);
                    setLoading(false);
                  }
                }
              );
            }
          }
        );
      } catch (error) {
        console.error('Error initializing GLTF loader:', error);
        if (isMounted) {
          setLoadError(true);
          setLoading(false);
        }
      }
    };
    
    loadModel();
    
    return () => {
      isMounted = false;
    };
  }, []);
  
  // Initialize the avatar when the model is loaded
  useEffect(() => {
    if (loadError) {
      // Create a simple fallback geometry
      console.log('Creating fallback cube avatar');
      const geometry = new THREE.BoxGeometry(1, 1, 1);
      const material = new THREE.MeshStandardMaterial({ 
        color: 0x4f46e5,
        metalness: 0.3,
        roughness: 0.4
      });
      const cube = new THREE.Mesh(geometry, material);
      setModel(cube);
      return;
    }
    
    if (gltf?.scene) {
      console.log('Initializing avatar model');
      const scene = gltf.scene.clone();
      setModel(scene);
      
      // Set up animations if available
      if (gltf.animations && gltf.animations.length > 0) {
        console.log('Setting up animations, count:', gltf.animations.length);
        const mixer = new THREE.AnimationMixer(scene);
        mixerRef.current = mixer;
        
        // Find idle and talking animations
        const idleClip = gltf.animations.find(anim => 
          anim.name.toLowerCase().includes('idle') || 
          anim.name.toLowerCase().includes('stand') ||
          anim.name.toLowerCase().includes('rest')
        );
        
        const talkClip = gltf.animations.find(anim => 
          anim.name.toLowerCase().includes('talk') || 
          anim.name.toLowerCase().includes('speak') ||
          anim.name.toLowerCase().includes('mouth')
        );
        
        if (idleClip) {
          console.log('Found idle animation:', idleClip.name);
          idleActionRef.current = mixer.clipAction(idleClip);
          idleActionRef.current.play();
        }
        
        if (talkClip) {
          console.log('Found talk animation:', talkClip.name);
          talkActionRef.current = mixer.clipAction(talkClip);
        }
      }
      
      // Find morph targets for facial expressions
      scene.traverse((child) => {
        if (child.isMesh && child.morphTargetDictionary) {
          console.log('Found morph targets:', Object.keys(child.morphTargetDictionary));
          setMorphTargets(child.morphTargetDictionary);
        }
      });
      
      if (onLoad) onLoad();
    }
  }, [gltf, loadError, onLoad]);
  
  // Handle animation updates
  useFrame((state, delta) => {
    if (loadError) return;
    
    if (mixerRef.current) {
      mixerRef.current.update(delta);
    }
    
    // Handle speaking animation
    if (model && talkActionRef.current) {
      if (isSpeaking) {
        if (idleActionRef.current && idleActionRef.current.isRunning()) {
          idleActionRef.current.fadeOut(0.2);
          talkActionRef.current.reset().fadeIn(0.2).play();
        }
      } else {
        if (talkActionRef.current.isRunning()) {
          talkActionRef.current.fadeOut(0.2);
          if (idleActionRef.current) {
            idleActionRef.current.reset().fadeIn(0.2).play();
          }
        }
      }
    }
    
    // Handle facial expressions and lip sync
    if (model && morphTargets) {
      updateFacialExpression(mood);
      updateLipSync();
    }
  });
  
  // Update facial expression based on mood
  const updateFacialExpression = (currentMood) => {
    if (!model || !morphTargets || loadError) return;
    
    // Reset all morph targets
    model.traverse((child) => {
      if (child.isMesh && child.morphTargetInfluences) {
        for (let i = 0; i < child.morphTargetInfluences.length; i++) {
          child.morphTargetInfluences[i] = 0;
        }
      }
    });
    
    // Apply mood-based morph targets
    if (currentMood) {
      console.log('Updating facial expression to:', currentMood.label);
      model.traverse((child) => {
        if (child.isMesh && child.morphTargetInfluences) {
          switch (currentMood.label.toLowerCase()) {
            case 'happy':
              // Apply happy expression morph targets
              if (morphTargets['mouthSmile'] !== undefined) {
                child.morphTargetInfluences[morphTargets['mouthSmile']] = 0.7;
              } else if (morphTargets['Smile'] !== undefined) {
                child.morphTargetInfluences[morphTargets['Smile']] = 0.7;
              }
              if (morphTargets['eyesHappy'] !== undefined) {
                child.morphTargetInfluences[morphTargets['eyesHappy']] = 0.5;
              } else if (morphTargets['Happy'] !== undefined) {
                child.morphTargetInfluences[morphTargets['Happy']] = 0.5;
              }
              break;
            case 'sad':
              // Apply sad expression morph targets
              if (morphTargets['mouthFrown'] !== undefined) {
                child.morphTargetInfluences[morphTargets['mouthFrown']] = 0.6;
              } else if (morphTargets['Frown'] !== undefined) {
                child.morphTargetInfluences[morphTargets['Frown']] = 0.6;
              }
              if (morphTargets['eyesSad'] !== undefined) {
                child.morphTargetInfluences[morphTargets['eyesSad']] = 0.4;
              }
              break;
            case 'surprise':
              // Apply surprised expression morph targets
              if (morphTargets['mouthOpen'] !== undefined) {
                child.morphTargetInfluences[morphTargets['mouthOpen']] = 0.8;
              } else if (morphTargets['Open'] !== undefined) {
                child.morphTargetInfluences[morphTargets['Open']] = 0.8;
              }
              if (morphTargets['eyesWide'] !== undefined) {
                child.morphTargetInfluences[morphTargets['eyesWide']] = 0.7;
              }
              if (morphTargets['browInnerUp'] !== undefined) {
                child.morphTargetInfluences[morphTargets['browInnerUp']] = 0.6;
              }
              break;
            case 'anger':
              // Apply angry expression morph targets
              if (morphTargets['mouthAngry'] !== undefined) {
                child.morphTargetInfluences[morphTargets['mouthAngry']] = 0.6;
              }
              if (morphTargets['eyesAngry'] !== undefined) {
                child.morphTargetInfluences[morphTargets['eyesAngry']] = 0.5;
              }
              if (morphTargets['browDownLeft'] !== undefined) {
                child.morphTargetInfluences[morphTargets['browDownLeft']] = 0.7;
              }
              if (morphTargets['browDownRight'] !== undefined) {
                child.morphTargetInfluences[morphTargets['browDownRight']] = 0.7;
              }
              break;
            default:
              // Neutral expression
              break;
          }
        }
      });
    }
  };
  
  // Update lip sync based on mouth openness
  const updateLipSync = () => {
    if (!model || !morphTargets || loadError) return;
    
    model.traverse((child) => {
      if (child.isMesh && child.morphTargetInfluences) {
        // Apply lip sync morph targets
        if (morphTargets['mouthOpen'] !== undefined) {
          child.morphTargetInfluences[morphTargets['mouthOpen']] = mouthOpenRef.current;
        } else if (morphTargets['Open'] !== undefined) {
          child.morphTargetInfluences[morphTargets['Open']] = mouthOpenRef.current;
        }
        
        if (morphTargets['jawOpen'] !== undefined) {
          child.morphTargetInfluences[morphTargets['jawOpen']] = mouthOpenRef.current * 0.8;
        }
        
        if (morphTargets['mouthSmile'] !== undefined && mouthOpenRef.current > 0.3) {
          child.morphTargetInfluences[morphTargets['mouthSmile']] = mouthOpenRef.current * 0.3;
        } else if (morphTargets['Smile'] !== undefined && mouthOpenRef.current > 0.3) {
          child.morphTargetInfluences[morphTargets['Smile']] = mouthOpenRef.current * 0.3;
        }
      }
    });
  };
  
  if (loading) {
    // Show loading state
    return (
      <mesh>
        <sphereGeometry args={[0.5, 16, 16]} />
        <meshStandardMaterial color="#4f46e5" wireframe />
      </mesh>
    );
  }
  
  if (!model) {
    // Show loading state
    return (
      <mesh>
        <boxGeometry args={[0.5, 0.5, 0.5]} />
        <meshStandardMaterial color="#4f46e5" wireframe />
      </mesh>
    );
  }
  
  // For fallback cube, just return it without additional properties
  if (loadError) {
    return <primitive object={model} position={[0, 0, 0]} />;
  }
  
  return (
    <primitive 
      ref={avatarRef}
      object={model}
      position={[0, -0.5, 0]}
      scale={[0.8, 0.8, 0.8]}
    />
  );
});

export default Avatar3D;