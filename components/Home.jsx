import React from 'react';
import bg1 from '../src/assets/bg1.jpg';
import '@/styles/home.css'
import Image from 'next/image'

const Home = () => {
  return (
    <Image
      className="home-container"
      src=".//src/assets/bg1.jpg"
    >
    </Image>
  );
};

export default Home;
