import React, { useState, useEffect } from "react";
import "./ImageSlider.css";

const images = [
  "/src/assets/claymores2.jpg",
  "/src/assets/claymores.jpg",
  "/image3.jpg",
];

const ImageSlider = () => {
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentImageIndex((prevIndex) => (prevIndex + 1) % images.length);
    }, 5000); // Change image every 5 seconds
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="image-slider">
      <img
        src={images[currentImageIndex]}
        alt={`Slide ${currentImageIndex}`}
        className="slider-image"
      />
    </div>
  );
};

export default ImageSlider;
